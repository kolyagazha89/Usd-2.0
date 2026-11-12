import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { parseBassRaceText, type BassRaceTextRow } from './bassrace-text-parser';

type PreviewRow = BassRaceTextRow & {
  classId: string | null;
  registrationId: string | null;
  registrationClassId: string | null;
  participant: string | null;
  status: 'READY' | 'ALREADY_IMPORTED' | 'BLOCKED';
  issue: string | null;
};

type Preview = {
  stageId: string;
  previewHash: string;
  rows: PreviewRow[];
  errors: string[];
  readyCount: number;
  alreadyCount: number;
  canCommit: boolean;
};

const isBassRace = (name: string) => name.trim().replace(/[\s_-]/g, '').toLowerCase() === 'bassrace';
const markPattern = (mark: number) => new RegExp('(?:^|\\D)' + String(mark).replace('.', '[.,]') + '(?:\\D|$)');

@Injectable()
export class BassRaceTextImportService {
  constructor(private readonly prisma: PrismaService) {}

  private async snapshot(tx: Prisma.TransactionClient, stageId: string, text: string): Promise<Preview> {
    let parsed: BassRaceTextRow[];
    try {
      parsed = parseBassRaceText(text);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Неверный формат протокола BassRace');
    }

    const stage = await tx.stage.findUnique({
      where: { id: stageId },
      select: { id: true, seasonId: true, status: true, isDeleted: true },
    });
    if (!stage || stage.isDeleted) throw new NotFoundException('Этап не найден');
    if (stage.status !== 'COMPLETED') {
      throw new ConflictException('Импорт BassRace доступен после завершения этапа (статус «Завершён»).');
    }

    const [stageClasses, registrations, disqualifications] = await Promise.all([
      tx.stageClass.findMany({
        where: { stageId },
        select: { classId: true, isActive: true, class: { select: { id: true, name: true, code: true, direction: { select: { name: true } } } } },
      }),
      tx.registration.findMany({
        where: { stageId, status: 'ACTIVE' },
        select: {
          id: true, participantId: true,
          participant: { select: { firstName: true, lastName: true, middleName: true } },
          stageInspection: { select: { status: true } },
          inspection: { select: { status: true } },
          classes: {
            select: {
              id: true, classId: true,
              number: { select: { number: true } },
              inspection: { select: { status: true } },
              results: { select: { id: true, place: true, value: true, isHistorical: true } },
            },
          },
        },
      }),
      tx.disqualification.findMany({
        where: {
          status: 'ACTIVE',
          OR: [{ scope: 'FORMAT' }, { scope: 'SEASON', seasonId: stage.seasonId }, { scope: 'STAGE', stageId }],
        },
        select: { participantId: true },
      }),
    ]);

    const blockedParticipants = new Set(disqualifications.map(item => item.participantId));
    const errors: string[] = [];
    const rows: PreviewRow[] = parsed.map(entry => {
      const stageClass = stageClasses.find(item =>
        isBassRace(item.class.direction.name) &&
        (markPattern(entry.classMark).test(item.class.name) || markPattern(entry.classMark).test(item.class.code)),
      );
      const matches = stageClass
        ? registrations.flatMap(registration => registration.classes
          .filter(cls => cls.classId === stageClass.classId && cls.number.number === entry.number)
          .map(cls => ({ registration, cls })))
        : [];
      const matching = matches.length === 1 ? matches[0] : null;
      const participant = matching
        ? [matching.registration.participant.lastName, matching.registration.participant.firstName, matching.registration.participant.middleName].filter(Boolean).join(' ')
        : null;
      let issue: string | null = null;
      let status: PreviewRow['status'] = 'READY';

      if (!stageClass) issue = 'Класс BassRace ' + entry.classMark + ' отсутствует на этапе';
      else if (!stageClass.isActive) issue = 'Класс BassRace ' + entry.classMark + ' отключён';
      else if (matches.length !== 1) issue = matches.length ? 'Неоднозначный номер в классе' : 'Номер не найден в классе BassRace ' + entry.classMark;
      else if (blockedParticipants.has(matching!.registration.participantId)) issue = 'Участник дисквалифицирован';
      else if ((matching!.registration.stageInspection ?? matching!.registration.inspection)?.status !== 'PASSED') issue = 'Нет успешной общей инспекции';
      else if (matching!.cls.inspection && matching!.cls.inspection.status !== 'PASSED') issue = 'Инспекция класса BassRace не пройдена';
      else if (matching!.cls.results.length > 1) issue = 'Несколько существующих результатов';
      else if (matching!.cls.results.length === 1) {
        const existing = matching!.cls.results[0];
        if (!existing.isHistorical && Number(existing.value) === entry.value && existing.place === entry.place) {
          status = 'ALREADY_IMPORTED';
        } else {
          issue = 'Результат уже существует и отличается. Исправьте его отдельно в админке';
        }
      }
      if (issue) {
        errors.push('Строка ' + entry.line + ': ' + issue);
        status = 'BLOCKED';
      }
      return {
        ...entry,
        classId: stageClass?.classId ?? null,
        registrationId: matching?.registration.id ?? null,
        registrationClassId: matching?.cls.id ?? null,
        participant,
        status,
        issue,
      };
    });

    const previewHash = createHash('sha256').update(JSON.stringify({ stageId, text, rows })).digest('hex');
    return {
      stageId, previewHash, rows, errors,
      readyCount: rows.filter(row => row.status === 'READY').length,
      alreadyCount: rows.filter(row => row.status === 'ALREADY_IMPORTED').length,
      canCommit: errors.length === 0,
    };
  }

  async preview(stageId: string, text: string) {
    if (!stageId || typeof text !== 'string') throw new BadRequestException('Укажите этап и текст протокола');
    return this.snapshot(this.prisma, stageId, text);
  }

  async commit(stageId: string, text: string, previewHash: string, request: AuthenticatedRequest) {
    if (request.user.role !== 'ADMIN') throw new ForbiddenException('Импорт BassRace доступен только ADMIN');
    if (!/^[0-9a-f]{64}$/i.test(previewHash ?? '')) throw new BadRequestException('Сначала проверьте текст протокола');

    return this.prisma.$transaction(async tx => {
      // Serializes concurrent imports of the same stage, then rechecks all registrations/results.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'bassrace-import:' + stageId}))`;
      const preview = await this.snapshot(tx, stageId, text);
      if (preview.previewHash !== previewHash) {
        throw new ConflictException('Данные изменились после предварительной проверки. Проверьте протокол заново.');
      }
      if (!preview.canCommit) throw new ConflictException('Протокол содержит ошибки. Ничего не импортировано.');

      for (const row of preview.rows) {
        if (row.status !== 'READY') continue;
        // No place recalculation: this is the authoritative order printed by the measuring program.
        await tx.result.create({
          data: {
            registrationId: row.registrationId!,
            registrationClassId: row.registrationClassId!,
            value: row.value,
            unit: 'DB',
            place: row.place,
            isBest: false,
            isHistorical: false,
            verificationStatus: 'NOT_REQUIRED',
            createdByUserId: request.user.sub,
            notes: 'Импорт BassRace из протокола замера',
          },
        });
      }
      if (preview.readyCount > 0) {
        await tx.auditLog.create({
          data: {
            userId: request.user.sub,
            action: 'BASSRACE_TEXT_RESULTS_IMPORTED',
            entity: 'Stage',
            entityId: stageId,
            ipAddress: request.ip,
            metadata: { imported: preview.readyCount, unchanged: preview.alreadyCount, sourceSha256: createHash('sha256').update(text).digest('hex') },
          },
        });
      }
      return { success: true, importedCount: preview.readyCount, unchangedCount: preview.alreadyCount };
    }, { isolationLevel: 'Serializable', timeout: 30000 });
  }
}
