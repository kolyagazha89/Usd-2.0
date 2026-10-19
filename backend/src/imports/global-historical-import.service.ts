import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { NameNormalizerService } from '../common/names/name-normalizer.service';
import { ImportsService } from './imports.service';
import { ArchivePlan, ArchiveStage, archiveNameKey, buildGlobalHistoricalPlan } from './global-historical-plan';
import { auditHistoricalDuplicates } from './historical-duplicate-audit';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

type Review = { sheet: string; row: number; name: string; reason: string };
type StageProgress = { name: string; year: number; number: number; status: string; sourceRows: number; jobId?: string; imported: number; aliases: number; kept: number; review: Review[]; resultIds: string[]; error?: string };
type Progress = { stages: StageProgress[]; updatedAt: string };
const ACTIVE_KEY = 'HISTORICAL_XLSX_GLOBAL';
const LEASE_MS = 5 * 60_000;
const asJson = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

@Injectable()
export class GlobalHistoricalImportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GlobalHistoricalImportService.name);
  private readonly running = new Set<string>();
  private stopping = false;
  constructor(private readonly prisma: PrismaService, private readonly imports: ImportsService, private readonly names: NameNormalizerService) {}

  async onModuleInit() {
    try {
      const batch = await this.prisma.historicalImportBatch.findFirst({ where: { activeKey: ACTIVE_KEY, status: 'RUNNING' } });
      if (batch) this.launch(batch.id);
    } catch (error) { this.logger.warn('Global import recovery is unavailable: ' + (error instanceof Error ? error.message : 'database unavailable')); }
  }
  onModuleDestroy() { this.stopping = true; }

  async latest() {
    const batch = await this.prisma.historicalImportBatch.findFirst({ orderBy: { createdAt: 'desc' } });
    return batch ? this.publicStatus(batch) : null;
  }
  async status(id: string) {
    const batch = await this.prisma.historicalImportBatch.findUnique({ where: { id } });
    if (!batch) throw new BadRequestException('Общая задача импорта не найдена');
    return this.publicStatus(batch);
  }
  async report(id: string) {
    const batch = await this.prisma.historicalImportBatch.findUnique({ where: { id } });
    if (!batch) throw new BadRequestException('Общая задача импорта не найдена');
    const plan = batch.plan as unknown as ArchivePlan;
    return { ...this.publicStatus(batch), people: plan.people, duplicateAudit: auditHistoricalDuplicates(plan, this.names), sourceWorkbooks: plan.sourceWorkbooks, sourceRows: plan.stages.map(stage => ({ name: stage.name, sheet: stage.resultsSheet, rows: stage.results })) };
  }

  preflight() {
    const plan = this.loadPlan();
    return { sourceHash: plan.sourceHash, sourceResults: plan.sourceResults, ...auditHistoricalDuplicates(plan, this.names) };
  }

  private loadPlan() {
    return buildGlobalHistoricalPlan(readFileSync(join(process.cwd(), 'data', 'historical-xlsx.json'), 'utf8'), this.names);
  }

  async start(request: AuthenticatedRequest) {
    const plan = this.loadPlan();
    const active = await this.prisma.historicalImportBatch.findUnique({ where: { activeKey: ACTIVE_KEY } });
    if (active) {
      if (active.sourceHash !== plan.sourceHash) throw new BadRequestException('Сначала завершите уже запущенный архив: его исходные файлы отличаются');
      this.launch(active.id); return this.publicStatus(active);
    }
    const previous = await this.prisma.historicalImportBatch.findFirst({ where: { sourceHash: plan.sourceHash }, orderBy: { createdAt: 'desc' } });
    if (previous?.status === 'RUNNING') { this.launch(previous.id); return this.publicStatus(previous); }
    if (previous?.status === 'COMPLETED' && await this.isIntact(previous.progress as unknown as Progress)) return this.publicStatus(previous);
    const progress: Progress = previous ? previous.progress as unknown as Progress : {
      stages: plan.stages.map(stage => ({ name: stage.name, year: stage.year, number: stage.number, status: 'PENDING', sourceRows: stage.results.length, imported: 0, aliases: 0, kept: 0, review: [], resultIds: [] })), updatedAt: new Date().toISOString(),
    };
    // Recheck completed stages too: a separate test-data reset may have removed
    // results after this batch finished. Do not trust a saved counter alone.
    for (const stage of progress.stages) {
      if (stage.status === 'DONE' && !await this.stageIntact(stage)) {
        stage.status = 'PENDING'; delete stage.jobId; stage.imported = 0; stage.resultIds = []; stage.kept = 0; stage.aliases = 0;
      } else if (stage.status !== 'DONE' && stage.status !== 'NO_RESULTS') stage.status = 'PENDING';
    }
    try {
      let batch;
      if (previous) {
        // Only one request may resume a completed/review batch. Never reset an
        // active worker's lease when two start requests race.
        await this.prisma.historicalImportBatch.updateMany({
          where: { id: previous.id, status: previous.status, activeKey: null },
          data: { status: 'RUNNING', activeKey: ACTIVE_KEY, leaseOwner: null, leaseUntil: null, progress: asJson(progress) },
        });
        batch = await this.prisma.historicalImportBatch.findUniqueOrThrow({ where: { id: previous.id } });
      } else {
        batch = await this.prisma.historicalImportBatch.create({ data: { sourceHash: plan.sourceHash, activeKey: ACTIVE_KEY, status: 'RUNNING', plan: asJson(plan), progress: asJson(progress), createdByUserId: request.user.sub } });
      }
      this.launch(batch.id); return this.publicStatus(batch);
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const existing = await this.prisma.historicalImportBatch.findUnique({ where: { activeKey: ACTIVE_KEY } });
      if (!existing) throw error;
      if (existing.sourceHash !== plan.sourceHash) throw new BadRequestException('Другой архив уже запущен');
      this.launch(existing.id); return this.publicStatus(existing);
    }
  }

  private async stageIntact(stage: StageProgress) {
    if (!stage.jobId || stage.imported !== stage.sourceRows) return false;
    const ids = [...new Set(stage.resultIds)];
    if (!ids.length) return stage.sourceRows === 0;
    return await this.prisma.result.count({ where: { id: { in: ids } } }) === ids.length;
  }
  private async isIntact(progress: Progress) {
    for (const stage of progress.stages) if (stage.status !== 'NO_RESULTS' && (stage.status !== 'DONE' || !await this.stageIntact(stage))) return false;
    return true;
  }
  private publicStatus(batch: { id: string; status: string; sourceHash: string; plan: unknown; progress: unknown; createdAt: Date; updatedAt: Date }) {
    const plan = batch.plan as ArchivePlan;
    const progress = batch.progress as Progress;
    const stages = progress.stages.map(({ resultIds: _ids, ...stage }) => stage);
    return { id: batch.id, status: batch.status, sourceHash: batch.sourceHash, createdAt: batch.createdAt, updatedAt: batch.updatedAt,
      sourceResults: plan.sourceResults, peopleInSource: plan.people.length, totalStages: stages.length,
      processedStages: stages.filter(stage => stage.status === 'DONE' || stage.status === 'NO_RESULTS').length,
      imported: stages.reduce((sum, stage) => sum + stage.imported, 0),
      kept: stages.reduce((sum, stage) => sum + stage.kept, 0),
      aliases: stages.reduce((sum, stage) => sum + stage.aliases, 0),
      needsReview: stages.reduce((sum, stage) => sum + (stage.status === 'FAILED' ? Math.max(stage.review.length, stage.sourceRows - stage.imported) : stage.review.length), 0),
      failedStages: stages.filter(stage => stage.status === 'FAILED').length, stages,
    };
  }

  private launch(id: string) {
    if (this.running.has(id) || this.stopping) return;
    this.running.add(id);
    setImmediate(() => { void this.run(id).catch(error => this.logger.error('Global import failed: ' + (error instanceof Error ? error.message : 'unknown error'))).finally(() => this.running.delete(id)); });
  }
  private async run(id: string) {
    const owner = randomUUID();
    const claimed = await this.prisma.historicalImportBatch.updateMany({ where: { id, status: 'RUNNING', OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, data: { leaseOwner: owner, leaseUntil: new Date(Date.now() + LEASE_MS) } });
    if (!claimed.count) {
      const current = await this.prisma.historicalImportBatch.findUnique({ where: { id } });
      if (current?.status === 'RUNNING' && current.leaseUntil) {
        const retry = setTimeout(() => this.launch(id), Math.max(1000, current.leaseUntil.getTime() - Date.now() + 100));
        retry.unref();
      }
      return;
    }
    let leaseLost = false;
    const heartbeat = setInterval(() => { void this.prisma.historicalImportBatch.updateMany({ where: { id, leaseOwner: owner }, data: { leaseUntil: new Date(Date.now() + LEASE_MS) } }).then(result => { if (!result.count) leaseLost = true; }).catch(() => { leaseLost = true; }); }, 30_000);
    heartbeat.unref();
    try {
      const batch = await this.prisma.historicalImportBatch.findUniqueOrThrow({ where: { id } });
      const plan = batch.plan as unknown as ArchivePlan;
      const progress = batch.progress as unknown as Progress;
      for (let index = 0; index < plan.stages.length; index += 1) {
        if (this.stopping || leaseLost) return;
        const stage = plan.stages[index]; const current = progress.stages[index];
        if (current.status === 'DONE' || current.status === 'NO_RESULTS') continue;
        current.status = 'RUNNING'; delete current.error;
        await this.saveProgress(id, owner, progress);
        try {
          if (!stage.results.length) { current.status = 'NO_RESULTS'; await this.saveProgress(id, owner, progress); continue; }
          await this.importStage(batch, stage, current, () => this.stopping || leaseLost);
        } catch (error) {
          current.status = 'FAILED'; current.error = error instanceof Error ? error.message : 'Неизвестная ошибка';
        }
        await this.saveProgress(id, owner, progress);
      }
      if (!leaseLost && !this.stopping) {
        const complete = progress.stages.every(stage => stage.status === 'DONE' || stage.status === 'NO_RESULTS');
        await this.prisma.historicalImportBatch.updateMany({ where: { id, leaseOwner: owner }, data: { status: complete ? 'COMPLETED' : 'NEEDS_REVIEW', activeKey: null, leaseOwner: null, leaseUntil: null, progress: asJson(progress) } });
      }
    } finally {
      clearInterval(heartbeat);
      await this.prisma.historicalImportBatch.updateMany({ where: { id, leaseOwner: owner }, data: { leaseOwner: null, leaseUntil: null } });
    }
  }
  private async saveProgress(id: string, owner: string, progress: Progress) {
    progress.updatedAt = new Date().toISOString();
    const saved = await this.prisma.historicalImportBatch.updateMany({ where: { id, leaseOwner: owner }, data: { progress: asJson(progress), leaseUntil: new Date(Date.now() + LEASE_MS) } });
    if (!saved.count) throw new Error('Право выполнения задачи передано другому процессу');
  }

  private async ensureStage(stage: ArchiveStage) {
    const season = await this.prisma.season.upsert({ where: { year: stage.year }, update: {}, create: { year: stage.year, name: 'USD ' + stage.year, status: stage.year < 2026 ? 'ARCHIVED' : 'ACTIVE', isActive: true } });
    let target = await this.prisma.stage.findUnique({ where: { seasonId_stageNumber: { seasonId: season.id, stageNumber: stage.number } } });
    if (target) {
      const live = await this.prisma.result.count({ where: { registration: { stageId: target.id }, isHistorical: false } });
      const ordinary = await this.prisma.registration.count({ where: { stageId: target.id, source: { not: 'IMPORT' } } });
      const blocked: string[] = [];
      if (live) blocked.push('неисторических результатов: ' + live);
      if (ordinary) blocked.push('обычных регистраций: ' + ordinary);
      if (target.registrationOpen) blocked.push('открыта регистрация');
      if (target.legacyId?.startsWith('USD_TEST_')) blocked.push('тестовый этап');
      if (target.isDeleted) blocked.push('этап удалён');
      if (target.date.toISOString().slice(0, 10) !== stage.date)
        blocked.push('дата этапа ' + target.date.toISOString().slice(0, 10) + ' не совпадает с архивом ' + stage.date);
      if (blocked.length) {
        throw new Error('Этап содержит обычные данные или отличается от архива; изменение запрещено: ' + blocked.join('; '));
      }
    } else target = await this.prisma.stage.create({ data: { seasonId: season.id, stageNumber: stage.number, name: stage.name, city: stage.city, date: new Date(stage.date + 'T12:00:00.000Z'), status: 'PUBLISHED', registrationOpen: false } });
    const classes = await this.prisma.class.findMany({ where: { isActive: true } });
    const classKey = (value: string) => value.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, '');
    for (const label of new Set(stage.results.map(row => this.imports.historicalClassName(String(row['Класс'] ?? ''))))) {
      const match = classes.find(item => classKey(item.name) === classKey(label));
      if (match) await this.prisma.stageClass.upsert({ where: { stageId_classId: { stageId: target.id, classId: match.id } }, update: {}, create: { stageId: target.id, classId: match.id } });
    }
    return target;
  }

  private async importStage(batch: { id: string; sourceHash: string; createdByUserId: string | null }, stage: ArchiveStage, progress: StageProgress, stopped: () => boolean) {
    const target = await this.ensureStage(stage);
    let job = progress.jobId ? await this.prisma.importJob.findUnique({ where: { id: progress.jobId }, include: { rows: { orderBy: [{ type: 'asc' }, { rowNumber: 'asc' }] } } }) : null;
    if (!job) {
      const preview = await this.imports.previewStage({ stageId: target.id, registrations: stage.registrations, results: stage.results, historicalResults: true, strictHistoricalNames: true });
      const updated = await this.prisma.importJob.update({ where: { id: preview.importJobId }, data: { metadata: asJson({ source: 'GLOBAL_HISTORICAL_XLSX', globalBatchId: batch.id, sourceHash: batch.sourceHash, historicalResults: true, carMetadataPolicy: 'REGISTRATION_NAME_REQUIRED_V1', workbookRegistrationSheet: stage.registrationSheet, workbookResultSheet: stage.resultsSheet }) }, include: { rows: { orderBy: [{ type: 'asc' }, { rowNumber: 'asc' }] } } });
      job = updated; progress.jobId = updated.id;
      // Persist the job ID before any commit. Recovery reuses the same rows.
      const current = await this.prisma.historicalImportBatch.findUniqueOrThrow({ where: { id: batch.id } });
      const saved = current.progress as unknown as Progress;
      const entry = saved.stages.find(item => item.year === stage.year && item.number === stage.number)!;
      entry.jobId = job.id;
      await this.prisma.historicalImportBatch.update({ where: { id: batch.id }, data: { progress: asJson(saved) } });
    }
    const protectedPeople = await this.prisma.participant.findMany({ where: { OR: [{ user: { isNot: null } }, { legacyId: { startsWith: 'USD_TEST_' } }] }, select: { id: true, lastName: true, firstName: true, middleName: true } });
    const protectedIds = new Set(protectedPeople.map(person => person.id));
    const protectedNames = new Set(protectedPeople.map(person => archiveNameKey([person.lastName, person.firstName, person.middleName].filter(Boolean).join(' '), this.names)));
    progress.review = [];
    for (const row of job.rows) {
      if (stopped()) return;
      if (row.type !== 'RESULT' || row.status === 'COMMITTED') continue;
      const normalized = row.normalizedData as any; const raw = row.rawData as any;
      const label = String(raw._archiveOriginalName ?? raw['ФИО'] ?? normalized?.participant?.rawName ?? '');
      const matches = Array.isArray(normalized?.participant?.matches) ? normalized.participant.matches : [];
      let reason = '';
      if (protectedNames.has(archiveNameKey(raw['ФИО'], this.names)) || matches.some((person: any) => protectedIds.has(person.id))) reason = 'Профиль с аккаунтом или тестовый профиль защищён';
      else if (row.status === 'RESOLVED') continue; // Preserve an explicit administrator decision on resume.
      else if (!normalized?.class?.classId) reason = 'Класс отсутствует в справочнике';
      else if (typeof normalized?.result !== 'number' || !Number.isFinite(normalized.result)) reason = 'Значение результата требует проверки';
      else if (!Number.isInteger(normalized?.participantNumber) || normalized.participantNumber <= 0) reason = 'Не удалось безопасно назначить номер участника';
      else if (normalized?.participant?.source === 'DATABASE' && normalized?.participant?.status === 'AMBIGUOUS') reason = 'Несколько разных карточек человека: нельзя выбрать автоматически';
      else if (normalized?.existingResult?.state === 'CONFLICT') reason = 'Существующий результат отличается: сохранены обе версии в отчёте';
      if (reason) {
        progress.review.push({ sheet: String(raw._archiveSheet ?? stage.resultsSheet), row: Number(raw._archiveRow ?? row.rowNumber), name: label, reason });
        await this.prisma.importRow.update({ where: { id: row.id }, data: { status: 'WARNING', resolution: Prisma.JsonNull, warnings: asJson([reason]) } });
        continue;
      }
      const inspected = this.names.inspect(String(raw['ФИО'] ?? label));
      const databaseMatch = normalized?.participant?.source === 'DATABASE' && matches.length === 1 && typeof matches[0]?.id === 'string' ? matches[0] : null;
      const resolution: Parameters<ImportsService['resolveImportRow']>[2] = {
        participant: inspected.needsReview ? { action: 'CREATE_ALIAS', fullName: String(raw['ФИО'] ?? label) }
          : databaseMatch ? { action: 'USE_EXISTING', participantId: databaseMatch.id }
          : { action: 'CREATE', fullName: inspected.normalized, team: normalized?.historicalTeam ?? null,
              email: normalized?.registration?.matchType === 'NAME' ? matches[0]?.email ?? null : null },
        registration: { action: 'CREATE', participantNumber: normalized.participantNumber, primaryParticipantNumber: normalized.participantNumber },
        car: { action: 'CREATE', brand: 'Не указано', model: normalized?.car?.model || 'Не указано', registrationNumber: normalized?.car?.plateNumber || undefined, registrationCountry: 'RU' },
        classId: normalized.class.classId, value: normalized.result, place: normalized.place ?? null,
        ...(normalized?.existingResult?.state === 'SAME' ? { existingResultAction: 'KEEP_EXISTING' } : {}),
        notes: inspected.needsReview ? 'Исходное архивное обозначение сохранено; личность не подтверждена. ' + label : undefined,
      };
      // The shared resolver accepts review rows only. A READY preview is still
      // uncommitted; move it through the same validated resolution path.
      if (row.status === 'READY') {
        await this.prisma.importRow.update({ where: { id: row.id }, data: { status: 'WARNING', warnings: asJson([]) } });
      }
      await this.imports.resolveImportRow(job.id, row.id, resolution);
    }
    if (stopped()) return;
    const fresh = await this.prisma.importJob.findUniqueOrThrow({ where: { id: job.id }, include: { rows: true } });
    const executable = fresh.rows.filter(row => row.type === 'RESULT' && (row.status === 'READY' || row.status === 'RESOLVED'));
    if (executable.length) {
      const request = batch.createdByUserId ? { user: { sub: batch.createdByUserId, role: 'ADMIN' }, ip: 'global-historical-import' } as AuthenticatedRequest : undefined;
      await this.imports.commitImport(job.id, request, { allowHistoricalPartial: true });
    }
    const completed = await this.prisma.importJob.findUniqueOrThrow({ where: { id: job.id }, include: { rows: true } });
    const rows = completed.rows.filter(row => row.type === 'RESULT');
    const committed = rows.filter(row => row.status === 'COMMITTED');
    progress.imported = committed.length;
    progress.aliases = committed.filter(row => (row.resolution as any)?.participant?.action === 'CREATE_ALIAS').length;
    progress.kept = committed.filter(row => (row.resolution as any)?.existingResultAction === 'KEEP_EXISTING').length;
    const ids = committed.map(row => row.classId && row.registrationId ? { registrationId: row.registrationId, classId: row.classId } : null).filter((item): item is { registrationId: string; classId: string } => item !== null);
    const results = ids.length ? await this.prisma.result.findMany({ where: { OR: ids.map(item => ({ registrationId: item.registrationId, registrationClass: { classId: item.classId } })) }, select: { id: true } }) : [];
    progress.resultIds = results.map(result => result.id);
    progress.status = progress.imported === stage.results.length ? 'DONE' : 'REVIEW';
    if (progress.imported + progress.review.length !== stage.results.length) throw new Error('Контроль строк не сошёлся: исходные строки сохранены, требуется проверка');
  }
}
