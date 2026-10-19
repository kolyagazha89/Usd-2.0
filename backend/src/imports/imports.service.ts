import { HISTORICAL_STAGE_MAPPINGS } from './historical-stage-mappings';
import { archivalAliasDisplayLabel, archivalAliasKey, globalHistoricalAliasKey, historicalAliasStickerDiscriminators } from './historical-alias-identity';
import { createHash, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NameNormalizerService } from '../common/names/name-normalizer.service';
import { Prisma } from '../generated/prisma/client';
import { RegistrationCountry } from '../generated/prisma/enums';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

type ImportRow = Record<string, unknown>;

type ParticipantIndexItem = {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  team: string | null;
  cars?: Array<{ registrationNumber: string }>;
  registrations?: Array<{ participantNumber: number }>;
};

type RegistrationParticipantMatch = {
  rowNumber: number;
  rawName: string;
  normalizedName: string;
  participantNumber: number | null;
  email: string;
  team: string;
  car: {
    model: string;
    plateNumber: string;
    vibrationIsolation: string | null;
  };
};

type RegistrationParticipantIndex = {
  strictNames?: boolean;
  byName: Map<string, RegistrationParticipantMatch[]>;
  byNumber: Map<number, RegistrationParticipantMatch[]>;
};

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nameNormalizer: NameNormalizerService,
  ) {}

  // Bound concurrent Preview queries so importing an entire season does not
  // exhaust the PostgreSQL connection pool. Output preserves source row order.
  private async mapPreviewRows<T, R>(
    rows: T[],
    mapper: (row: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const limit = Math.min(8, rows.length);
    const output = new Array<R>(rows.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: limit }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= rows.length) return;
        output[index] = await mapper(rows[index], index);
      }
    }));
    return output;
  }

  async getImportJob(id: string) {
    const importJob = await this.prisma.importJob.findFirst({
      where: {
        id,
      },
      include: {
        stage: true,
        rows: {
          orderBy: [
            { type: 'asc' },
            { rowNumber: 'asc' },
          ],
        },
      },
    });

    if (!importJob) {
      throw new NotFoundException(`ImportJob ${id} не найден`);
    }

    return {
      success: true,
      importJob,
    };
  }

  async previewStage(
    body: {
      stageId: string;
      registrations?: ImportRow[];
      results?: ImportRow[];
      historicalResults?: boolean;
      strictHistoricalNames?: boolean;
    },
    request?: AuthenticatedRequest,
  ) {
    if (!body.stageId) {
      throw new BadRequestException('stageId обязателен');
    }

    const registrations = body.registrations ?? [];
    const results = body.results ?? [];

    const stage = await this.prisma.stage.findUnique({
      where: {
        id: body.stageId,
      },
    });

    if (!stage) {
      throw new NotFoundException('Этап не найден');
    }

    const participants = await this.prisma.participant.findMany({
      select: {
        id: true,
        lastName: true,
        firstName: true,
        middleName: true,
        team: true,
        // Used only to distinguish genuinely different Participant IDs that
        // share a full name. Never choose one from a name alone.
        cars: { select: { registrationNumber: true } },
        registrations: {
          where: { stageId: body.stageId },
          select: { participantNumber: true },
        },
      },
    });

    const stageClasses = await this.prisma.stageClass.findMany({
      where: {
        stageId: body.stageId,
      },
      include: {
        class: true,
      },
    });

    const participantMatches =
      this.buildParticipantIndex(participants);

    const registrationParticipants =
      body.historicalResults === true
        ? this.buildRegistrationParticipantIndex(registrations, body.strictHistoricalNames === true)
        : await this.buildStageRegistrationParticipantIndex(body.stageId);

    const registrationPreview = await this.mapPreviewRows(
      registrations,
      (row, index) => this.previewRegistrationRow(
        row, index + 1, participantMatches, stageClasses, body.stageId,
        body.historicalResults === true,
      ),
    );

    // Проверяем дубли номеров внутри самого файла до Commit.
    const importedNumberRows = new Map<number, number[]>();
    registrations.forEach((row, index) => {
      const number = this.parseParticipantNumber(this.getImportFieldValue(row, [
        'Номер участника', '№ участника', 'Номер', 'participantNumber',
      ]));
      if (number !== null) {
        const list = importedNumberRows.get(number) ?? [];
        list.push(index + 1);
        importedNumberRows.set(number, list);
      }
    });
    for (const [number, rowNumbers] of importedNumberRows) {
      if (rowNumbers.length < 2) continue;
      for (const rowNumber of rowNumbers) {
        const preview = registrationPreview[rowNumber - 1];
        if (preview) {
          if (body.historicalResults !== true) {
            preview.warnings.push(`Строка ${rowNumber}: номер участника ${number} указан ещё в строках ${rowNumbers.filter((n) => n !== rowNumber).join(', ')} этого импорта`);
            preview.status = 'WARNING';
          }
        }
      }
    }

    const historicalNumberMap =
      body.historicalResults === true
        ? await this.buildHistoricalFallbackNumbers(stage.id, registrations, results)
        : undefined;

    const resultPreview = await this.mapPreviewRows(
      results,
      (row, index) => this.previewResultRow(
        row, index + 1, participantMatches, registrationParticipants,
        stageClasses, body.stageId, body.historicalResults === true,
        historicalNumberMap,
      ),
    );

    if (body.historicalResults === true) {
    // BassRace can assign a different stage sticker to each additional
    // class of one participant. Reserve from AFTER the largest number in
    // the entire source, so early extra classes cannot take a later rider's
    // original printed number. These are non-blocking preview hints; commit
    // repeats the allocation against live RegistrationNumber rows.
    const sourceNumbers = [...registrations, ...results].map((row) =>
      this.parseParticipantNumber(this.getImportFieldValue(row, [
        'Номер участника', '№ участника', 'Номер', 'participantNumber',
      ]))).filter((n): n is number => n !== null);
    const stageMax = await this.prisma.registrationNumber.aggregate({
      where: { stageId: body.stageId },
      _max: { number: true },
    });
    const stagePrimaryMax = await this.prisma.registration.aggregate({
      where: { stageId: body.stageId },
      _max: { participantNumber: true },
    });
    let nextBassRaceNumber = Math.max(0, stageMax._max.number ?? 0,
      stagePrimaryMax._max.participantNumber ?? 0, ...sourceNumbers);
    const bassRaceClassesByParticipant = new Map<string, Set<string>>();
    for (const item of resultPreview) {
      if (!item.class?.isBassRace || !item.class?.classId) continue;
      const participantKey = item.participant.normalizedName ||
        this.normalizePersonName(item.participant.rawName);
      if (!participantKey) continue;
      const seen = bassRaceClassesByParticipant.get(participantKey) ?? new Set<string>();
      if (seen.size > 0 && !seen.has(item.class.classId)) {
        nextBassRaceNumber += 1;
        item.classParticipantNumber = nextBassRaceNumber;
        item.classNumberSource = 'AUTO';
      } else {
        item.classParticipantNumber = item.participantNumber;
        item.classNumberSource = 'RESULT_OR_REGISTRATION';
      }
      seen.add(item.class.classId);
      bassRaceClassesByParticipant.set(participantKey, seen);
    }
    }

    const participantsNew = new Set<string>();
    const participantsMatched = new Set<string>();
    const participantsAmbiguous = new Set<string>();
    const participantsOnlyInResults = new Set<string>();

    for (const item of [
      ...registrationPreview,
      ...resultPreview,
    ]) {
      if (item.participant.status === 'NEW') {
        participantsNew.add(
          item.participant.normalizedName,
        );
      }

      if (item.participant.status === 'MATCHED') {
        participantsMatched.add(
          item.participant.normalizedName,
        );
      }

      if (item.participant.status === 'AMBIGUOUS') {
        participantsAmbiguous.add(
          item.participant.normalizedName,
        );
      }

      if (
        'source' in item.participant &&
        item.participant.source === 'DATABASE' &&
        'registration' in item &&
        item.registration?.status === 'NOT_FOUND'
      ) {
        participantsOnlyInResults.add(
          item.participant.normalizedName,
        );
      }
    }

    const warnings = [
      ...registrationPreview.flatMap(
        (item) => item.warnings,
      ),
      ...resultPreview.flatMap(
        (item) => item.warnings,
      ),
    ];

    const resultWarnings = resultPreview.filter(
      (item) => item.status === 'WARNING',
    ).length;

    const validClassCount = [
      ...registrationPreview.flatMap(
        (item) => item.classes,
      ),
      ...resultPreview.flatMap(
        (item) => item.class,
      ),
    ].filter(
      (item) => item.status === 'MATCHED',
    ).length;

    const summary = {
      participants: {
        new: participantsNew.size,
        matched: participantsMatched.size,
        ambiguous: participantsAmbiguous.size,
        onlyInResults:
          participantsOnlyInResults.size,
      },

      registrations: {
        total: registrations.length,

        valid: registrationPreview.filter(
          (item) => item.status === 'READY',
        ).length,

        invalid: registrationPreview.filter(
          (item) => item.status === 'WARNING',
        ).length,
      },

      classes: validClassCount,

      results: {
        total: results.length,

        ready: resultPreview.filter(
          (item) => item.status === 'READY',
        ).length,

        warnings: resultWarnings,

        preserved: resultPreview.length,
      },

      warningsCount: warnings.length,
    };

    const importJob =
      await this.prisma.importJob.create({
        data: {
          stageId: stage.id,
          status: 'DRAFT',
          createdByUserId: request?.user.sub ?? null,

          summary,

          metadata: {
            source: 'PREVIEW',
            stageId: stage.id,
            stageNumber: stage.stageNumber,
            stageName: stage.name,
            historicalResults: body.historicalResults === true,
            carMetadataPolicy: 'REGISTRATION_NAME_REQUIRED_V1',
          },

          rows: {
            create: [
              ...registrations.map(
                (row, index) => {
                  const preview =
                    registrationPreview[index];

                  return {
                    type: 'REGISTRATION' as const,

                    rowNumber: index + 1,

                    status:
                      preview.status === 'READY'
                        ? ('READY' as const)
                        : ('WARNING' as const),

                    rawData: this.toJson(row),

                    normalizedData:
                      this.toJson(preview),

                    warnings: this.toJson(
                      preview.warnings,
                    ),
                  };
                },
              ),

              ...results.map(
                (row, index) => {
                  const preview =
                    resultPreview[index];

                  const historicalResolution =
                    body.historicalResults === true &&
                    preview.status === 'READY'
                      ? {
                          participant:
                            preview.participant.source === 'DATABASE' &&
                            preview.participant.status === 'MATCHED' &&
                            preview.participant.matches?.length
                              ? {
                                  action: 'USE_EXISTING',
                                  participantId:
                                    preview.participant.matches[0].id,
                                }
                              : {
                                  action: 'CREATE',
                                  fullName:
                                    this.normalizedDisplayName(preview.participant.rawName),
                                  team: preview.historicalTeam,
                                  email:
                                    preview.participant.source === 'REGISTRATION' &&
                                    preview.registration.matchType === 'NAME'
                                      ? preview.participant.matches?.[0]?.email || null
                                      : null,
                                },
                          registration: {
                            action: 'CREATE',
                            participantNumber:
                              preview.participantNumber,
                            primaryParticipantNumber:
                              preview.participantNumber,
                          },
                          classId:
                            preview.class?.classId,
                          value:
                            preview.result,
                          place:
                            preview.place,
                          car: {
                            action: 'CREATE',
                            brand: 'Не указано',
                            model: preview.car?.model || 'Не указано',
                            registrationNumber: preview.car?.plateNumber || undefined,
                            registrationCountry: 'RU',
                          },
                        }
                      : undefined;

                  return {
                    type: 'RESULT' as const,

                    rowNumber: index + 1,

                    status:
                      preview.status === 'READY'
                        ? ('READY' as const)
                        : ('WARNING' as const),

                    rawData: this.toJson(row),

                    normalizedData:
                      this.toJson(preview),

                    warnings: this.toJson(
                      preview.warnings,
                    ),

                    resolution:
                      historicalResolution,

                    participantNumber:
                      preview.participantNumber,

                    place: preview.place,

                    value:
                      preview.result,

                    unit:
                      preview.result !== null
                        ? ('DB' as const)
                        : undefined,
                  };
                },
              ),
            ],
          },
        },

        include: {
          rows: true,
        },
      });

    if (request) {
      await this.prisma.auditLog.create({
        data: {
          userId: request.user.sub,
          action: 'IMPORT_CREATED',
          entity: 'ImportJob',
          entityId: importJob.id,
          ipAddress: request.ip,
          metadata: {
            stageId: stage.id,
            rowsCount: importJob.rows.length,
            historicalResults: body.historicalResults === true,
          },
        },
      });
    }

    return {
      success: true,

      importJobId: importJob.id,

      importJob: {
        id: importJob.id,
        status: importJob.status,
        createdAt: importJob.createdAt,
        rowsCount: importJob.rows.length,
      },

      stage: {
        id: stage.id,
        seasonId: stage.seasonId,
        stageNumber: stage.stageNumber,
        name: stage.name,
        city: stage.city,
        date: stage.date,
      },

      participants: summary.participants,

      registrations: summary.registrations,

      classes: summary.classes,

      results: summary.results,

      warnings,

      registrationPreview,
      resultPreview,
    };
  }

  historicalClassName(value: string) { return this.mapClassName(value); }

  async prepareHistoricalXlsxImport(request: AuthenticatedRequest) {
    const sourcePath = join(process.cwd(), 'data', 'historical-xlsx.json');
    let source: any;
    try {
      source = JSON.parse(readFileSync(sourcePath, 'utf8'));
    } catch {
      throw new BadRequestException('Исторический XLSX snapshot не найден в deployment');
    }

    const registrationWorkbook = source['USD _ Регистрация.xlsx'] ?? {};
    const resultsWorkbook = source['USD _ Результаты.xlsx'] ?? {};

    const mappings = HISTORICAL_STAGE_MAPPINGS;

    const prepared: any[] = [];

    for (const mapping of mappings) {
      let season = await this.prisma.season.findUnique({ where: { year: mapping.year } });
      if (!season) {
        season = await this.prisma.season.create({
          data: {
            year: mapping.year,
            name: `USD ${mapping.year}`,
            status: mapping.year === 2026 ? 'ACTIVE' : 'ARCHIVED',
            isActive: true,
          },
        });
      }

      const existingStage = await this.prisma.stage.findUnique({
        where: { seasonId_stageNumber: { seasonId: season.id, stageNumber: mapping.number } },
      });

      const stage = existingStage
        ? await this.prisma.stage.update({
            where: { id: existingStage.id },
            data: {
              name: mapping.name,
              city: mapping.city,
              date: new Date(`${mapping.date}T12:00:00.000Z`),
              status: 'PUBLISHED',
              registrationOpen: false,
              isDeleted: false,
            },
          })
        : await this.prisma.stage.create({
            data: {
              seasonId: season.id,
              stageNumber: mapping.number,
              name: mapping.name,
              city: mapping.city,
              date: new Date(`${mapping.date}T12:00:00.000Z`),
              status: 'PUBLISHED',
              registrationOpen: false,
              isDeleted: false,
            },
          });

      // Каждый новый запуск подготовки архива должен начинать с чистого DRAFT.
      // Иначе старые RESOLVED/WARNING из предыдущего Preview возвращаются после F5
      // и пользователь уже не может заново принять другое решение по строкам.
      const staleHistoricalJobs = await this.prisma.importJob.findMany({
        where: {
          stageId: stage.id,
          status: 'DRAFT',
          metadata: {
            path: ['source'],
            equals: 'HISTORICAL_XLSX',
          },
        },
        select: { id: true },
      });

      if (staleHistoricalJobs.length) {
        await this.prisma.importJob.deleteMany({
          where: {
            id: { in: staleHistoricalJobs.map((job) => job.id) },
          },
        });
      }

      const registrations = mapping.reg ? this.rowsFromSheet(registrationWorkbook[mapping.reg]) : [];
      const results = mapping.result ? this.resultRowsFromSheet(resultsWorkbook[mapping.result]) : [];

      const classNames = new Set<string>();
      for (const row of registrations) {
        for (const key of ['SPL', 'BF SPL', 'BDW SPL', 'Bass Race', 'SPL Hurricane']) {
          const value = this.stringValue(row[key]);
          if (value && value.toLowerCase() !== 'yes') classNames.add(this.mapClassName(value));
        }
      }
      for (const row of results) {
        const value = this.stringValue(row['Класс']);
        if (value) classNames.add(this.mapClassName(value));
      }

      const allClasses = await this.prisma.class.findMany({ where: { isActive: true } });
      const classesByName = new Map(allClasses.map((item) => [this.normalizeClassName(item.name), item]));
      for (const className of classNames) {
        const classItem = classesByName.get(this.normalizeClassName(className));
        if (!classItem) continue;
        await this.prisma.stageClass.upsert({
          where: { stageId_classId: { stageId: stage.id, classId: classItem.id } },
          update: { isActive: true },
          create: { stageId: stage.id, classId: classItem.id },
        });
      }

      // Archive participants always require Results, even when a helper sheet
      // has no corresponding Results sheet. Registration alone is not attendance.
      const historicalResults = true;
      const result = await this.previewStage(
        { stageId: stage.id, registrations, results, historicalResults },
        request,
      );

      await this.prisma.importJob.update({
        where: { id: result.importJobId },
        data: {
          metadata: {
            source: 'HISTORICAL_XLSX',
            sourceWorkbooks: source._source?.workbooks ?? null,
            carMetadataPolicy: 'REGISTRATION_NAME_REQUIRED_V1',
            workbookRegistrationSheet: mapping.reg,
            workbookResultSheet: mapping.result,
            historicalResults,
            stageNumber: mapping.number,
            stageName: mapping.name,
          },
        },
      });

      prepared.push({
        stageId: stage.id,
        stageNumber: mapping.number,
        stageName: stage.name,
        importJobId: result.importJobId,
        status: 'DRAFT',
        reused: false,
        registrations: registrations.length,
        results: results.length,
        warnings: result.warnings?.length ?? 0,
      });
    }

    return {
      success: true,
      source: { file: 'historical-xlsx.json', workbooks: ['USD _ Регистрация.xlsx', 'USD _ Результаты.xlsx'] },
      prepared,
      message: 'Исторические данные подготовлены как DRAFT ImportJob. Нерешённые WARNING не коммитятся.',
    };
  }


  async autoCommitHistoricalImport(request: AuthenticatedRequest) {
    const prepared = await this.prepareHistoricalXlsxImport(request);
    const report: Array<{
      stageNumber: number;
      stageName: string;
      importJobId: string;
      committed: boolean;
      autoResolved: number;
      skipped: Array<{ rowNumber: number; warnings: string[] }>;
    }> = [];

    for (const item of prepared.prepared) {
      const job = await this.prisma.importJob.findUnique({
        where: { id: item.importJobId },
        include: { rows: true },
      });
      if (!job) continue;

      let autoResolved = 0;
      const skipped: Array<{ rowNumber: number; warnings: string[] }> = [];

      await this.prisma.$transaction(async (tx) => {
        for (const row of job.rows) {
          if (row.type === 'REGISTRATION') {
            if (row.status === 'WARNING') {
              await tx.importRow.update({
                where: { id: row.id },
                data: { status: 'READY', resolution: Prisma.JsonNull },
              });
            }
            continue;
          }

          if (row.status !== 'WARNING') continue;

          const normalized = row.normalizedData as any;
          const warnings = Array.isArray(row.warnings)
            ? row.warnings.map((value: any) => String(value))
            : [];

          const classId =
            typeof normalized?.class?.classId === 'string'
              ? normalized.class.classId
              : null;
          const value =
            typeof normalized?.result === 'number' &&
            Number.isFinite(normalized.result)
              ? normalized.result
              : null;
          const participantNumber =
            Number.isInteger(normalized?.participantNumber) &&
            normalized.participantNumber > 0
              ? normalized.participantNumber
              : null;
          const rawName =
            this.stringValue(normalized?.participant?.rawName) ||
            this.stringValue(
              this.getImportFieldValue(row.rawData as any, [
                'ФИО',
                'Фамилия и имя',
                'participantName',
              ]),
            );

          if (!classId || value === null || participantNumber === null || !rawName) {
            skipped.push({ rowNumber: row.rowNumber, warnings });
            continue;
          }

          const participantMatches = Array.isArray(normalized?.participant?.matches)
            ? normalized.participant.matches
            : [];
          const databaseMatch =
            participantMatches.find(
              (match: any) => typeof match?.id === 'string',
            ) ?? null;

          const resolution: any = {
            participant: databaseMatch
              ? {
                  action: 'USE_EXISTING',
                  participantId: databaseMatch.id,
                }
              : {
                  action: 'CREATE',
                  fullName: this.normalizedDisplayName(rawName),
                  team: this.normalizeImportedTeam(normalized?.historicalTeam),
                  email: null,
                },
            registration: {
              action: 'CREATE',
              participantNumber,
              primaryParticipantNumber: participantNumber,
            },
            classId,
            value,
            place:
              normalized?.place === null ||
              normalized?.place === undefined
                ? null
                : Number(normalized.place),
            car: {
              action: 'CREATE',
              brand: 'Не указано',
              model:
                this.stringValue(normalized?.car?.model) ||
                'Автомобиль не указан',
              ...(this.stringValue(normalized?.car?.plateNumber)
                ? {
                    registrationNumber:
                      this.stringValue(normalized?.car?.plateNumber),
                  }
                : {}),
              registrationCountry: 'RU',
            },
          };

          if (
            normalized?.existingResult?.state === 'SAME' ||
            normalized?.existingResult?.state === 'CONFLICT'
          ) {
            resolution.existingResultAction = 'REPLACE';
          }

          await tx.importRow.update({
            where: { id: row.id },
            data: { status: 'RESOLVED', resolution },
          });
          autoResolved += 1;
        }
      });

      if (skipped.length) {
        report.push({
          stageNumber: item.stageNumber,
          stageName: item.stageName,
          importJobId: item.importJobId,
          committed: false,
          autoResolved,
          skipped,
        });
        continue;
      }

      try {
        await this.commitImport(item.importJobId, request);
        report.push({
          stageNumber: item.stageNumber,
          stageName: item.stageName,
          importJobId: item.importJobId,
          committed: true,
          autoResolved,
          skipped: [],
        });
      } catch (error) {
        const fresh = await this.prisma.importJob.findUnique({
          where: { id: item.importJobId },
          include: { rows: true },
        });
        const remaining = fresh?.rows
          .filter((row) => row.type === 'RESULT' && row.status !== 'COMMITTED')
          .map((row) => ({
            rowNumber: row.rowNumber,
            warnings: Array.isArray(row.warnings)
              ? row.warnings.map((value: any) => String(value))
              : [String((error as Error)?.message ?? error)],
          })) ?? [];
        report.push({
          stageNumber: item.stageNumber,
          stageName: item.stageName,
          importJobId: item.importJobId,
          committed: false,
          autoResolved,
          skipped: remaining,
        });
      }
    }

    return {
      success: true,
      source: prepared.source,
      prepared: prepared.prepared.length,
      committed: report.filter((item) => item.committed).length,
      errors: report.filter((item) => !item.committed),
      report,
    };
  }

  private rowsFromSheet(sheet: any): Record<string, unknown>[] {
    if (!Array.isArray(sheet) || sheet.length === 0) return [];
    const headers = Array.isArray(sheet[0]) ? sheet[0] : [];

    return sheet.slice(1)
      .filter(
        (row: any[]) =>
          Array.isArray(row) &&
          row.some(
            (value) =>
              value !== null &&
              value !== undefined &&
              String(value).trim() !== '',
          ),
      )
      .map((row: any[]) => {
        const output: Record<string, unknown> = {};
        headers.forEach((header: any, index: number) => {
          if (
            header === null ||
            header === undefined ||
            String(header).trim() === ''
          ) {
            return;
          }

          output[String(header)] = row[index] ?? null;
        });

        return output;
      })
      .filter((output) => {
        /*
         * Некоторые исторические XLSX содержат хвостовые строки, где
         * заполнен только номер участника (например 181..200), а ФИО,
         * автомобиль, класс и остальные поля пустые. Это не реальные
         * регистрации и не должны превращаться в WARNING-строки импорта.
         *
         * Для регистрационной таблицы считаем строку пустой, если кроме
         * номера участника в ней нет ни одного содержательного поля.
         */
        const participantNumberKey = [
          'Номер участника',
          '№ участника',
          'participantNumber',
        ].find((key) => Object.prototype.hasOwnProperty.call(output, key));

        if (!participantNumberKey) return true;

        const meaningfulFields = Object.entries(output).filter(
          ([key, value]) =>
            key !== participantNumberKey &&
            value !== null &&
            value !== undefined &&
            String(value).trim() !== '',
        );

        return meaningfulFields.length > 0;
      });
  }

  private resultRowsFromSheet(sheet: any): Record<string, unknown>[] {
    const rows = this.rowsFromSheet(sheet);
    let currentClass = '';
    return rows.map((row) => {
      const rawClass = this.stringValue(row['Класс']);
      if (rawClass) currentClass = rawClass;
      return { ...row, 'Класс': currentClass };
    }).filter((row: any) => this.stringValue(row['Класс']) && this.stringValue(row['ФИО']));
  }

  private buildParticipantIndex(
    participants: ParticipantIndexItem[],
  ) {
    const index =
      new Map<string, ParticipantIndexItem[]>();

    for (const participant of participants) {
      const fullName = [
        participant.lastName,
        participant.firstName,
        participant.middleName,
      ]
        .filter(Boolean)
        .join(' ');

      const names = new Set<string>();

      const normalizedFullName =
        this.normalizePersonName(
          fullName,
        );

      if (normalizedFullName) {
        names.add(normalizedFullName);
      }

      const normalizedWithoutMiddleName =
        this.normalizePersonName(
          [
            participant.lastName,
            participant.firstName,
          ]
            .filter(Boolean)
            .join(' '),
        );

      if (normalizedWithoutMiddleName) {
        names.add(
          normalizedWithoutMiddleName,
        );
      }

      for (const normalizedName of names) {
        const existing =
          index.get(normalizedName) ?? [];

        existing.push(participant);

        index.set(
          normalizedName,
          existing,
        );
      }
    }

    return index;
  }

  private buildRegistrationParticipantIndex(
    registrations: ImportRow[],
    strictNames = false,
  ): RegistrationParticipantIndex {
    const byName =
      new Map<
        string,
        RegistrationParticipantMatch[]
      >();

    const byNumber =
      new Map<
        number,
        RegistrationParticipantMatch[]
      >();

    registrations.forEach(
      (row, indexNumber) => {
        const rawName =
          this.stringValue(
            this.getImportFieldValue(
              row,
              [
                'Фамилия и имя',
                'ФИО',
                'Фамилия Имя',
                'Участник',
                'participantName',
              ],
            ),
          );

        const normalizedName =
          this.normalizePersonName(
            rawName,
          );

        const participantNumber =
          this.parseParticipantNumber(
            this.getImportFieldValue(
              row,
              [
                'Номер участника',
                '№ участника',
                'Номер',
                'participantNumber',
              ],
            ),
          );

        if (
          !normalizedName &&
          participantNumber === null
        ) {
          return;
        }

        const registrationParticipant:
          RegistrationParticipantMatch = {
          rowNumber: indexNumber + 1,

          rawName,

          normalizedName,

          participantNumber,

          email:
            this.stringValue(              this.getImportFieldValue(                row,
                [
                  'Email',
                  'E-mail',
                  'Электронная почта',
                  'email',
                ],
              ),
            ),

          team:
            this.stringValue(
              this.getImportFieldValue(
                row,
                [
                  'Команда',
                  'team',
                ],
              ),
            ),

          car: {
            model:
              this.stringValue(
                this.getImportFieldValue(
                  row,
                  [
                    'Модель автомобиля',
                    'Модель',
                    'model',
                  ],
                ),
              ),

            plateNumber:
              this.stringValue(
                this.getImportFieldValue(
                  row,
                  [
                    'Номер автомобиля', 'Гос. номер', 'Гос номер',
                    'Регистрационный номер', 'registrationNumber', 'plateNumber',
                  ],
                ),
              ),
            // This is the ONLY source of historical vibration isolation.
            // The Results sheet is intentionally not consulted.
            vibrationIsolation: this.stringValue(this.getImportFieldValue(row, [
              'Виброизоляция', 'Марка виброизоляции', 'Бренд виброизоляции',
              'vibrationIsolation',
            ])) || null,
          },
        };

        for (const alias of this.nameAliases(rawName)) {
          const existingByName =
            byName.get(alias) ?? [];

          existingByName.push(
            registrationParticipant,
          );

          byName.set(
            alias,
            existingByName,
          );
        }

        if (participantNumber !== null) {
          const existingByNumber =
            byNumber.get(
              participantNumber,
            ) ?? [];

          existingByNumber.push(
            registrationParticipant,
          );

          byNumber.set(
            participantNumber,
            existingByNumber,
          );
        }
      },
    );

    return {
      byName,
      byNumber,
      strictNames,
    };
  }

  private async buildStageRegistrationParticipantIndex(stageId: string): Promise<RegistrationParticipantIndex> {
    const registrations = await this.prisma.registration.findMany({
      where: { stageId, status: 'ACTIVE' },
      select: {
        participantNumber: true,
        participant: {
          select: { lastName: true, firstName: true, middleName: true },
        },
      },
      orderBy: { participantNumber: 'asc' },
    });

    const byName = new Map<string, RegistrationParticipantMatch[]>();
    const byNumber = new Map<number, RegistrationParticipantMatch[]>();

    registrations.forEach((registration, index) => {
      const rawName = [registration.participant.lastName, registration.participant.firstName, registration.participant.middleName]
        .filter(Boolean)
        .join(' ');
      const normalizedName = this.normalizePersonName(rawName);
      const match: RegistrationParticipantMatch = {
        rowNumber: index + 1,
        rawName,
        normalizedName,
        participantNumber: registration.participantNumber,
        email: '',
        team: '',
        car: { model: '', plateNumber: '', vibrationIsolation: null },
      };
      if (normalizedName) {
        const list = byName.get(normalizedName) ?? [];
        list.push(match);
        byName.set(normalizedName, list);
      }
      const numberList = byNumber.get(registration.participantNumber) ?? [];
      numberList.push(match);
      byNumber.set(registration.participantNumber, numberList);
    });

    return { byName, byNumber };
  }

  private findParticipant(
    rawName: string,
    participantIndex: Map<
      string,
      ParticipantIndexItem[]
    >,
  ) {
    const normalizedName =
      this.normalizePersonName(
        rawName,
      );

    if (!normalizedName) {
      return {
        status: 'NEW' as const,
        normalizedName,
        matches: [],
      };
    }

    const matches =
      participantIndex.get(
        normalizedName,
      ) ?? [];

    /*
     * Safe historical-import fallback:
     * - compare normalized/transliterated name tokens without depending on
     *   surname-first vs first-name-first order;
     * - accept only exact token sets (no edit-distance guessing);
     * - treat multiple candidates as ambiguous instead of creating a duplicate.
     * Include the two-token form to handle source rows without patronymics.
     */
    if (matches.length === 0) {
      const targetTokens = this.nameTokens(rawName);

      const allCandidates = this.uniqueParticipants(
        [...participantIndex.values()].flat(),
      );
      const exactTokenMatches = allCandidates.filter((candidate) => {
        const fullName = [
          candidate.lastName,
          candidate.firstName,
          candidate.middleName,
        ].filter(Boolean).join(' ');
        const withoutMiddle = [
          candidate.lastName,
          candidate.firstName,
        ].filter(Boolean).join(' ');

        const fullTokens = this.nameTokens(fullName);
        const shortTokens = this.nameTokens(withoutMiddle);
        const exactSet = (left: string[], right: string[]) =>
          left.length >= 2 &&
          left.length === right.length &&
          left.every((token) => right.includes(token));

        return exactSet(targetTokens, fullTokens) ||
          (targetTokens.length === 2 && exactSet(targetTokens, shortTokens)) ||
          (targetTokens.length >= 3 &&
            !candidate.middleName &&
            shortTokens.length === 2 &&
            shortTokens.every((token) => targetTokens.includes(token)));
      });

      if (exactTokenMatches.length === 1) {
        return {
          status: 'MATCHED' as const,
          normalizedName,
          matches: exactTokenMatches,
        };
      }

      if (exactTokenMatches.length > 1) {
        return {
          status: 'AMBIGUOUS' as const,
          normalizedName,
          matches: exactTokenMatches,
        };
      }

      const fallbackMatches =
        this.findParticipantByTokens(
          normalizedName,
          participantIndex,
        );

      if (fallbackMatches.length === 1) {
        return {
          status: 'MATCHED' as const,
          normalizedName,
          matches: fallbackMatches,
        };
      }

      if (fallbackMatches.length > 1) {
        return {
          status: 'AMBIGUOUS' as const,
          normalizedName,
          matches: fallbackMatches,
        };
      }

      return {
        status: 'NEW' as const,
        normalizedName,
        matches: [],
      };
    }

    const uniqueMatches =
      this.uniqueParticipants(
        matches,
      );

    if (uniqueMatches.length === 1) {
      return {
        status: 'MATCHED' as const,
        normalizedName,
        matches: uniqueMatches,
      };
    }

    return {
      status: 'AMBIGUOUS' as const,
      normalizedName,
      matches: uniqueMatches,
    };
  }

  private findParticipantByTokens(
    normalizedName: string,
    participantIndex: Map<
      string,
      ParticipantIndexItem[]
    >,
  ): ParticipantIndexItem[] {
    const targetTokens =
      normalizedName
        .split(' ')
        .filter(Boolean);

    if (targetTokens.length < 2) {
      return [];
    }

    const matches: ParticipantIndexItem[] = [];

    for (const participants of participantIndex.values()) {
      for (const participant of participants) {
        const candidateFullName =
          this.normalizePersonName(
            [
              participant.lastName,
              participant.firstName,
              participant.middleName,
            ]
              .filter(Boolean)
              .join(' '),
          );

        const candidateWithoutMiddle =
          this.normalizePersonName(
            [
              participant.lastName,
              participant.firstName,
            ]
              .filter(Boolean)
              .join(' '),
          );

        if (
          this.samePersonName(
            normalizedName,
            candidateFullName,
          ) ||
          this.samePersonName(
            normalizedName,
            candidateWithoutMiddle,
          )
        ) {
          matches.push(
            participant,
          );
        }
      }
    }

    return this.uniqueParticipants(
      matches,
    );
  }

  private uniqueParticipants(
    participants: ParticipantIndexItem[],
  ) {
    const map =
      new Map<
        string,
        ParticipantIndexItem
      >();

    for (const participant of participants) {
      map.set(
        participant.id,
        participant,
      );
    }

    return [
      ...map.values(),
    ];
  }

  private samePersonName(
    left: string,
    right: string,
  ) {
    if (!left || !right) {
      return false;
    }

    if (left === right) {
      return true;
    }

    const leftTokens =
      left
        .split(' ')
        .filter(Boolean);

    const rightTokens =
      right
        .split(' ')
        .filter(Boolean);

    if (
      leftTokens.length < 2 ||
      rightTokens.length < 2
    ) {
      return false;
    }

    if (
      leftTokens[0] !==
      rightTokens[0]
    ) {
      return false;
    }

    if (
      leftTokens[1] !==
      rightTokens[1]
    ) {
      return false;
    }

    if (
      leftTokens.length >= 3 &&
      rightTokens.length >= 3
    ) {
      return (
        leftTokens[2] ===
        rightTokens[2]
      );
    }

    return true;
  }

  /**
   * Multiple Registration sheet rows often describe the SAME car entered in
   * different BassRace classes. Rows are not distinct people. Collapse only
   * when evidence is compatible; otherwise keep the ambiguity visible.
   *
   * Results number is used to select a helper row, never to rewrite it.
   * Missing result number + several distinct helper numbers => use AUTO
   * fallback instead of arbitrarily choosing one historical sticker.
   */
  private chooseRegistrationSheetCandidate(
    candidates: RegistrationParticipantMatch[],
    resultNumber?: number | null,
  ): RegistrationParticipantMatch | null {
    if (candidates.length === 1) return candidates[0];
    if (candidates.length === 0) return null;

    const exactNumber = resultNumber && resultNumber > 0
      ? candidates.filter((candidate) => candidate.participantNumber === resultNumber)
      : [];
    if (exactNumber.length === 1) return exactNumber[0];

    const group = exactNumber.length > 1 ? exactNumber : candidates;
    // A plate or verified email shared by all rows is a stronger identity
    // signal than equal names. Two *different* nonempty plates/emails block.
    const plates = group.map((item) => this.normalizeImportedPlate(item.car.plateNumber))
      .filter((value) => value.length > 0 && !value.startsWith('IMPORT'));
    const emails = group.map((item) => item.email.trim().toLowerCase()).filter(Boolean);
    const numbers = [...new Set(group.map((item) => item.participantNumber).filter((n) => n !== null))];
    const brands = [...new Set(group.map((item) => item.car.vibrationIsolation?.trim().toLowerCase())
      .filter(Boolean))];
    const samePlate = plates.length === group.length && new Set(plates).size === 1;
    const sameEmail = emails.length === group.length && new Set(emails).size === 1;
    const repeatedIdenticalNumber = numbers.length === 1 &&
      group.every((item) => item.participantNumber === numbers[0]);
    const compatibleMetadata =
      new Set(plates).size <= 1 &&
      new Set(emails).size <= 1 &&
      brands.length <= 1;
    if (!compatibleMetadata || !(samePlate || sameEmail || repeatedIdenticalNumber)) {
      return null;
    }
    const row = group.find((item) => item.car.vibrationIsolation?.trim()) ?? group[0];
    // The source has multiple number variants for this exact same car/email.
    // The single result row with no number must use stage-safe AUTO fallback.
    return !resultNumber && numbers.length > 1
      ? { ...row, participantNumber: null }
      : row;
  }

  private resolveDatabaseNameCollision(
    candidate: ReturnType<ImportsService['findParticipant']>,
    resultNumber: number | null,
    registration: ReturnType<ImportsService['findRegistrationParticipant']>,
  ) {
    if (candidate.status !== 'AMBIGUOUS') return candidate;

    const matches = candidate.matches;
    const rawPlate = registration.status === 'MATCHED' &&
      registration.matchType === 'NAME'
        ? registration.matches[0]?.car.plateNumber ?? ''
        : '';
    const normalizedPlate = this.normalizeImportedPlate(rawPlate);

    const byPlate = normalizedPlate && !normalizedPlate.startsWith('IMPORT')
      ? matches.filter((person) => person.cars?.some((car) =>
          this.normalizeImportedPlate(car.registrationNumber) === normalizedPlate))
      : [];
    const byStageNumber = resultNumber !== null
      ? matches.filter((person) =>
          person.registrations?.some((row) => row.participantNumber === resultNumber))
      : [];

    // If two strong sources point to DIFFERENT Participant IDs, do not pick
    // whichever happened to be checked first: require human verification.
    if (byPlate.length === 1 && byStageNumber.length === 1 &&
      byPlate[0].id !== byStageNumber[0].id) {
      return candidate;
    }
    const verified = byPlate.length === 1 ? byPlate :
      byStageNumber.length === 1 ? byStageNumber : [];
    if (verified.length === 1) {
      return { ...candidate, status: 'MATCHED' as const, matches: verified };
    }
    // Do not automatically merge or select actual duplicate Participant IDs.
    return candidate;
  }

  /**
   * Historical Results is the ONLY source of competitors. Registration is a
   * helper for metadata, never a source of extra participants. Copy team only
   * after an exact name-token match (not the sticker-number fallback).
   *
   * A Results FIO can omit a patronymic that Registration includes. Multiple
   * helper rows (e.g. Voitenko's two cars) may still establish ONE team when
   * every matching row agrees. Car/email/plate remain ambiguous and must
   * NEVER be selected through this team consensus.
   */
  private normalizeImportedTeam(value: unknown): string | null {
    const team = this.stringValue(value).normalize('NFKC').replace(/\s+/g, ' ').trim();
    const absent = new Set([
      '', '-', '—', '–', 'нет', 'без команды', 'нет команды',
      'не указано', 'не указана', 'none', 'no team', 'n/a',
    ]);
    return absent.has(team.toLocaleLowerCase('ru')) ? null : team;
  }

  private findHistoricalTeamFromRegistration(
    rawName: string,
    registrationIndex: RegistrationParticipantIndex,
  ): string | null {
    if (this.nameNormalizer.inspect(rawName).needsReview) return null;
    const target = this.nameTokens(rawName);
    if (target.length !== 2 && target.length !== 3) return null;

    const matches: RegistrationParticipantMatch[] = [];
    const seenRows = new Set<number>();

    for (const candidateRows of registrationIndex.byName.values()) {
      for (const candidate of candidateRows) {
        if (seenRows.has(candidate.rowNumber)) continue;
        const tokens = this.nameTokens(candidate.rawName);
        const exact = tokens.length === target.length &&
          target.every((token) => tokens.includes(token));
        const extra = target.length === 2 && tokens.length === 3 &&
          target.every((token) => tokens.includes(token))
          ? tokens.find((token) => !target.includes(token))
          : null;
        // Extra label words (#Team...) must not masquerade as a patronymic.
        const withPatronymic = Boolean(extra && /(?:ovich|evich|ovna|evna|ichna)$/.test(extra));
        if (!exact && !withPatronymic) continue;
        seenRows.add(candidate.rowNumber);
        matches.push(candidate);
      }
    }

    if (!matches.length) return null;
    if (target.length === 2) {
      const patronymics = new Set(matches
        .map((candidate) => this.nameTokens(candidate.rawName)
          .filter((token) => !target.includes(token)).join(' '))
        .filter(Boolean));
      // Same short name + different patronymics may be different people.
      if (patronymics.size > 1) return null;
    }

    const values = matches.map((candidate) => this.normalizeImportedTeam(candidate.team));
    // Conflicting teams, or a mixture of named and empty teams, is uncertain.
    if (new Set(values.map((team) => (team ?? '').toLocaleLowerCase('ru'))).size !== 1) {
      return null;
    }
    return values[0];
  }

  private findRegistrationParticipant(
    rawName: string,
    registrationIndex: RegistrationParticipantIndex,
    participantNumber?: number | null,
  ) {
    const normalizedName = this.normalizePersonName(rawName);

    /*
     * Historical import: ФИО is the key used to enrich a 000 result
     * from the Registration sheet. The number in Results is the source
     * of truth and must never be used to reject a name match.
     *
     * We therefore try name matching first. This is especially important
     * when Results contains 000 or when the same participant has a
     * different historical number in Results.
     */
    const exactAliases = new Set(this.nameAliases(rawName));
    const exactMatches: RegistrationParticipantMatch[] = [];

    for (const alias of exactAliases) {
      for (const match of registrationIndex.byName.get(alias) ?? []) {
        if (!exactMatches.some((item) => item.rowNumber === match.rowNumber)) {
          exactMatches.push(match);
        }
      }
    }

    if (exactMatches.length === 1) {
      return {
        status: 'MATCHED' as const,
        normalizedName,
        matches: exactMatches,
        matchType: 'NAME' as const,
      };
    }

    if (exactMatches.length > 1) {
      const selected = this.chooseRegistrationSheetCandidate(exactMatches, participantNumber);
      return {
        status: selected ? ('MATCHED' as const) : ('AMBIGUOUS' as const),
        normalizedName,
        matches: selected ? [selected] : exactMatches,
        matchType: 'NAME' as const,
      };
    }

    /*
     * Names in the historical sheets can be written as
     * "Фамилия Имя" or "Имя Фамилия", and transliterations differ.
     * Compare transliterated token sets, not the whole string order.
     */
    if (normalizedName && !registrationIndex.strictNames) {
      const targetTokens = this.nameTokens(rawName);
      const fuzzyMatches: RegistrationParticipantMatch[] = [];

      for (const candidateRows of registrationIndex.byName.values()) {
        for (const match of candidateRows) {
          if (
            fuzzyMatches.some(
              (item) => item.rowNumber === match.rowNumber,
            )
          ) {
            continue;
          }

          const candidateTokens = this.nameTokens(match.rawName);
          if (this.nameTokenMatch(targetTokens, candidateTokens)) {
            fuzzyMatches.push(match);
          }
        }
      }

      if (fuzzyMatches.length === 1) {
        return {
          status: 'MATCHED' as const,
          normalizedName,
          matches: fuzzyMatches,
          matchType: 'NAME' as const,
        };
      }

      if (fuzzyMatches.length > 1) {
        const selected = this.chooseRegistrationSheetCandidate(fuzzyMatches, participantNumber);
        return {
          status: selected ? ('MATCHED' as const) : ('AMBIGUOUS' as const),
          normalizedName,
          matches: selected ? [selected] : fuzzyMatches,
          matchType: 'NAME' as const,
        };
      }
    }

    /*
     * Only after name matching fails do we fall back to the positive
     * number from Results.  A positive result number is never replaced
     * by the Registration number; it is used only to find the helper row.
     */
    if (
      participantNumber !== null &&
      participantNumber !== undefined &&
      participantNumber > 0
    ) {
      const numberMatches =
        registrationIndex.byNumber.get(participantNumber) ?? [];

      if (numberMatches.length === 1) {
        return {
          status: 'MATCHED' as const,
          normalizedName:
            numberMatches[0].normalizedName || normalizedName,
          matches: numberMatches,
          matchType: 'NUMBER' as const,
        };
      }

      if (numberMatches.length > 1) {
        return {
          status: 'AMBIGUOUS' as const,
          normalizedName,
          matches: numberMatches,
          matchType: 'NUMBER' as const,
        };
      }
    }

    return {
      status: 'NOT_FOUND' as const,
      normalizedName,
      matches: [],
      matchType: 'NAME' as const,
    };
  }

  private nameTokens(value: string): string[] {
    const transliterated = this.transliterateRussianName(value);
    return transliterated
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .sort();
  }

  private nameTokenMatch(
    target: string[],
    candidate: string[],
  ): boolean {
    if (!target.length || !candidate.length) return false;

    /*
     * Exact token-set match handles "Сергей Мещеряков" vs
     * "Misheryakov Sergey". For small transliteration differences,
     * allow one close token while requiring the rest to match.
     */
    if (
      target.length === candidate.length &&
      target.every((token) => candidate.includes(token))
    ) {
      return true;
    }

    if (target.length !== candidate.length) {
      return false;
    }

    const used = new Set<number>();
    let closeCount = 0;

    for (const token of target) {
      let bestIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (let i = 0; i < candidate.length; i++) {
        if (used.has(i)) continue;
        const distance = this.levenshtein(token, candidate[i]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
        }
      }

      if (bestIndex < 0) return false;

      const shortestTokenLength = Math.min(
        token.length,
        candidate[bestIndex].length,
      );
      const maxDistance =
        shortestTokenLength >= 8
          ? 2
          : Math.max(1, Math.floor(shortestTokenLength * 0.3));

      if (bestDistance > maxDistance) return false;

      used.add(bestIndex);
      closeCount++;
    }

    return closeCount === target.length;
  }

  private async previewRegistrationRow(
    row: ImportRow,
    rowNumber: number,
    participantIndex: Map<
      string,
      ParticipantIndexItem[]
    >,
    stageClasses: Array<any>,
    stageId: string,
    historicalResults = false,
  ) {
    const rawName = String(
      this.getImportFieldValue(row, [
        'Фамилия и имя',
        'ФИО',
        'Фамилия Имя',
        'Участник',
        'participantName',
      ]) ?? '',
    ).trim();

    const rawParticipantNumber =
      this.getImportFieldValue(
        row,
        [
          'Номер участника',
          '№ участника',
          'Номер',
          'participantNumber',
        ],
      );

    const participantNumber =
      this.parseParticipantNumber(
        rawParticipantNumber,
      );

    const rawModel = String(
      this.getImportFieldValue(row, [
        'Модель автомобиля',
        'Модель',
        'model',
      ]) ?? '',
    ).trim();

    const rawPlate = String(
      this.getImportFieldValue(row, [
        'Номер автомобиля',
        'Гос. номер',
        'Гос номер',
        'Регистрационный номер',
        'registrationNumber',
        'plateNumber',
      ]) ?? '',
    )
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ');

    const team = String(
      this.getImportFieldValue(row, [
        'Команда',
        'team',
      ]) ?? '',
    ).trim();

    const email = String(
      this.getImportFieldValue(row, [
        'Email',
        'E-mail',
        'Электронная почта',
        'email',
      ]) ?? '',
    ).trim();

    const participant = this.findParticipant(
      rawName,
      participantIndex,
    );

    const classSources = [
      {
        column: 'SPL',
        value: row['SPL'],
        direction: 'SPL',
      },
      {
        column: 'BF SPL',
        value: row['BF SPL'],
        direction: 'BFSPL',
      },
      {
        column: 'BDW SPL',
        value: row['BDW SPL'],
        direction: 'BDW',
      },
      {
        column: 'Bass Race',
        value: row['Bass Race'],
        direction: 'BassRace',
      },
      {
        column: 'SPL Hurricane',
        value: row['SPL Hurricane'],
        direction: 'Hurrican',      },
    ];
    const classes: any[] = [];
    const warnings: string[] = [];
    const processedColumns =
      new Set<string>();

    for (const item of classSources) {
      processedColumns.add(
        item.column,
      );

      const value =
        this.stringValue(
          item.value,
        );

      if (!value) {
        continue;
      }

      const markerValue =
        value
          .trim()
          .toLowerCase();

      const isDirectionMarker =
        [
          '1',
          'yes',
          'да',
          'true',
          '+',
          'x',
        ].includes(
          markerValue,
        );

      if (isDirectionMarker) {
        classes.push({
          sourceColumn: item.column,
          sourceValue: value,
          status: 'MANUAL_MAPPING',
          direction: item.direction,
          className: null,
        });

        warnings.push(
          `Строка ${rowNumber}: направление "${item.direction}" указано, но конкретный класс не определён автоматически`,
        );

        continue;
      }

      const className =
        this.mapClassName(
          value,
        );

      const found =
        this.findStageClass(
          className,
          stageClasses,
        );

      if (!found) {
        classes.push({
          sourceColumn: item.column,
          sourceValue: value,
          status: 'WARNING',
          direction: item.direction,
          className,
        });

        warnings.push(
          `Строка ${rowNumber}: класс "${className}" не подключён к этому этапу`,
        );

        continue;
      }

      classes.push({
        sourceColumn: item.column,
        sourceValue: value,
        status: 'MATCHED',
        direction: item.direction,
        classId: found.class.id,
        className: found.class.name,
      });
    }

    for (const stageClass of stageClasses) {
      const className =
        this.stringValue(
          stageClass?.class?.name,
        );

      if (!className) {
        continue;
      }

      const sourceColumn =
        this.findMatchingObjectKey(
          row,
          className,
        );

      if (!sourceColumn) {
        continue;
      }

      if (
        processedColumns.has(
          sourceColumn,
        )
      ) {
        continue;
      }

      processedColumns.add(
        sourceColumn,
      );

      const sourceValue =
        this.stringValue(
          row[sourceColumn],
        );

      if (!sourceValue) {
        continue;
      }

      const markerValue =
        sourceValue
          .trim()
          .toLowerCase();

      const isMarker =
        [
          '1',
          'yes',
          'да',
          'true',
          '+',
          'x',
          className
            .trim()
            .toLowerCase(),
        ].includes(
          markerValue,
        );

      if (!isMarker) {
        const mappedClass =
          this.mapClassName(
            sourceValue,
          );

        const foundFromValue =
          this.findStageClass(
            mappedClass,
            stageClasses,
          );

        if (
          foundFromValue &&
          foundFromValue.class.id !==
          stageClass.class.id
        ) {
          continue;
        }
      }

      classes.push({
        sourceColumn,
        sourceValue,
        status: 'MATCHED',
        direction:
          this.getClassDirectionName(
            stageClass,
          ),
        classId:
          stageClass.class.id,
        className:
          stageClass.class.name,
      });
    }

    if (participant.status === 'AMBIGUOUS') {
      warnings.push(
        `Строка ${rowNumber}: найдено несколько участников с ФИО "${rawName}"`,
      );
    }

    if (participant.status === 'NEW') {
      warnings.push(
        `Строка ${rowNumber}: участник "${rawName}" отсутствует в базе и будет требовать проверки`,
      );
    }

    /*
     * Проверяем конфликт регистрации уже на Preview.
     *
     * Это повторяет логику getOrCreateImportCar():
     * 1. номер автомобиля;
     * 2. модель;
     * 3. технический автомобиль.
     */
    if (
      participant.status === 'MATCHED' &&
      participant.matches.length === 1
    ) {
      const participantId =
        participant.matches[0].id;

      let car = null;

      if (rawPlate) {
        const participantCars =
          await this.prisma.car.findMany({
            where: { participantId },
            orderBy: { createdAt: 'asc' },
          });
        car = participantCars.find(
          (candidate) =>
            this.normalizeImportedPlate(candidate.registrationNumber) ===
            this.normalizeImportedPlate(rawPlate),
        ) ?? null;
      }

      if (!car && rawModel && !rawPlate) {
        car =
          await this.prisma.car.findFirst({
            where: {
              participantId,
              model: rawModel,
            },
            orderBy: {
              createdAt: 'asc',
            },
          });
      }

      if (
        !car &&
        !rawPlate &&
        !rawModel
      ) {
        const technicalRegistrationNumber =
          `IMPORT-${participantId
            .slice(0, 8)
            .toUpperCase()}`;

        car =
          await this.prisma.car.findFirst({
            where: {
              participantId,
              registrationNumber:
                technicalRegistrationNumber,
            },
            orderBy: {
              createdAt: 'asc',
            },
          });
      }

      if (car) {
        const existingRegistration =
          await this.prisma.registration.findUnique(
            {
              where: {
                stageId_carId: {
                  stageId,
                  carId: car.id,
                },
              },
              select: {
                id: true,
                participantId: true,
                participantNumber: true,
                status: true,
              },
            },
          );

        if (existingRegistration) {
          if (
            existingRegistration.participantId !==
            participantId
          ) {
            warnings.push(
              `Строка ${rowNumber}: автомобиль "${rawPlate || rawModel || car.registrationNumber}" уже зарегистрирован на этом этапе за другим участником`,
            );
          } else if (
            existingRegistration.status ===
            'ACTIVE'
          ) {
            if (
              participantNumber !==
              existingRegistration.participantNumber
            ) {
              warnings.push(
                `Строка ${rowNumber}: автомобиль "${car.registrationNumber}" уже зарегистрирован на этом этапе под номером ${existingRegistration.participantNumber}; в импорте указан номер ${participantNumber ?? 'не указан'}`,
              );
            } else {
              warnings.push(
                `Строка ${rowNumber}: автомобиль "${car.registrationNumber}" уже зарегистрирован на этом этапе под номером ${existingRegistration.participantNumber}`,
              );
            }
          } else if (
            existingRegistration.status ===
            'CANCELLED'
          ) {
            warnings.push(
              `Строка ${rowNumber}: автомобиль "${car.registrationNumber}" ранее уже регистрировался на этом этапе под номером ${existingRegistration.participantNumber} и сейчас находится в статусе CANCELLED; при Commit регистрация будет восстановлена с тем же номером`,
            );
          }
        }
      }
    }

    /*
     * Проверяем конфликт номера участника.
     */
    if (
      participantNumber !== null
    ) {
      const existingByNumber =
        await this.prisma.registration.findUnique(
          {
            where: {
              stageId_participantNumber: {
                stageId,
                participantNumber,
              },
            },
            select: {
              id: true,
              participantId: true,
              participantNumber: true,
              status: true,
              carId: true,
            },
          },
        );

      if (existingByNumber) {
        const matchedParticipantId =
          participant.status === 'MATCHED' &&
          participant.matches.length === 1
            ? participant.matches[0].id
            : null;

        const isSameParticipant =
          !!matchedParticipantId &&
          existingByNumber.participantId === matchedParticipantId;

        if (!isSameParticipant) {
          const owner = await this.prisma.participant.findUnique({
            where: { id: existingByNumber.participantId },
            select: { lastName: true, firstName: true, middleName: true },
          });
          const ownerName = owner
            ? [owner.lastName, owner.firstName, owner.middleName].filter(Boolean).join(' ')
            : 'участник из базы';
          const importedName = rawName || 'участник из импорта';
          warnings.push(
            `Строка ${rowNumber}: номер участника ${participantNumber} уже принадлежит другому участнику на этом этапе. В базе: ${ownerName}; в импорте: ${importedName}`,
          );
        }
      }
    }

    /*
     * Один класс на одно направление.
     */
    const matchedClasses =
      classes.filter(
        (item) =>
          item.status === 'MATCHED' &&
          item.classId,
      );

    const directionIds =
      new Set<string>();

    for (const item of matchedClasses) {
      const stageClass =
        stageClasses.find(
          (stageClass) =>
            stageClass?.class?.id ===
            item.classId,
        );

      const directionId =
        stageClass?.class?.directionId ??
        stageClass?.directionId ??
        null;

      if (!directionId) {
        continue;
      }

      if (
        directionIds.has(directionId)
      ) {
        warnings.push(
          `Строка ${rowNumber}: в одной регистрации указано несколько классов одного направления`,
        );
        break;
      }

      directionIds.add(
        directionId,
      );
    }

    if (historicalResults) {
      warnings.length = 0;
    }

    return {
      rowNumber,

      status:
        warnings.length > 0
          ? ('WARNING' as const)
          : ('READY' as const),

      participant: {
        rawName,
        ...participant,
      },

      participantNumber,

      car: {
        model: rawModel,
        plateNumber: rawPlate,
      },

      team,

      email,

      classes,

      warnings,
    };
  }

  private async buildHistoricalFallbackNumbers(
    stageId: string,
    registrations: ImportRow[],
    results: ImportRow[],
  ) {
    const used = new Set<number>();
    const map = new Map<string, number>();
    const add = (value: unknown) => {
      const number = this.parseParticipantNumber(value);
      if (number !== null) used.add(number);
    };
    for (const row of registrations) add(this.getImportFieldValue(row, ['Номер участника','№ участника','Номер','participantNumber']));
    for (const row of results) add(this.getImportFieldValue(row, ['Номер','Номер участника','participantNumber']));

    const names = new Set<string>();
    for (const row of results) {
      const name = this.stringValue(this.getImportFieldValue(row, ['ФИО','Фамилия и имя','participantName']));
      const number = this.parseParticipantNumber(this.getImportFieldValue(row, ['Номер','Номер участника','participantNumber']));
      const key = this.normalizePersonName(name);
      if (key && number === null) names.add(key);
    }

    const existing = await this.prisma.registration.aggregate({
      where: { stageId },
      _max: { participantNumber: true },
    });
    let next = Math.max(0, existing._max.participantNumber ?? 0, ...Array.from(used)) + 1;
    for (const key of names) {
      while (used.has(next)) next += 1;
      map.set(key, next);
      used.add(next);
      next += 1;
    }
    return map;
  }

  private async previewResultRow(
    row: ImportRow,
    rowNumber: number,
    participantIndex: Map<
      string,
      ParticipantIndexItem[]
    >,
    registrationParticipantIndex: RegistrationParticipantIndex,
    stageClasses: Array<any>,
    stageId: string,
    historicalResults = false,
    fallbackParticipantNumbers?: Map<string, number>,
  ) {
    const rawName =
      this.stringValue(
        this.getImportFieldValue(
          row,
          [
            'ФИО',
            'Фамилия и имя',
            'participantName',
          ],
        ),
      );

    const nameInspection = this.nameNormalizer.inspect(rawName);
    const historicalTeam = historicalResults
      ? this.findHistoricalTeamFromRegistration(rawName, registrationParticipantIndex)
      : null;

    const rawNumber =
      this.numberValue(
        this.getImportFieldValue(
          row,
          [
            'Номер',
            'Номер участника',
            'participantNumber',
          ],
        ),
      );

    const resultParticipantNumber =
      rawNumber !== null &&
      rawNumber > 0
        ? rawNumber
        : null;

    const registrationParticipant =
      this.findRegistrationParticipant(
        rawName,
        registrationParticipantIndex,
        resultParticipantNumber,
      );

    const databaseParticipant =
      this.resolveDatabaseNameCollision(
        this.findParticipant(rawName, participantIndex),
        resultParticipantNumber,
        registrationParticipant,
      );

    let participant:
      | (ReturnType<
          typeof this.findParticipant
        > & {
          source: 'DATABASE';
        })      | {
          status:
            | 'MATCHED'            | 'AMBIGUOUS';

          normalizedName: string;

          matches:
            RegistrationParticipantMatch[];

          source: 'REGISTRATION';
        };

    if (
      historicalResults &&
      (databaseParticipant.status === 'MATCHED' ||
       databaseParticipant.status === 'AMBIGUOUS')
    ) {
      // Existing Participant IDs are authoritative, even when they clash.
      // A matching Registration helper cannot erase the fact that the DB
      // contains multiple different people with the same name. Only a unique
      // stage-number/car link may disambiguate them safely.
      participant = {
        ...databaseParticipant,
        source: 'DATABASE',
      };
    } else if (
      historicalResults &&
      databaseParticipant.status === 'NEW' &&
      (registrationParticipant.status === 'AMBIGUOUS' || registrationParticipant.matchType === 'NUMBER')
    ) {
      // Historical Results drives new participant identity. Conflicting helper
      // rows are not evidence of multiple Participants in the database.
      // Create from Results, and do not borrow uncertain car/vibration values.
      participant = { ...databaseParticipant, source: 'DATABASE' };
    } else if (
      registrationParticipant.status ===
      'MATCHED'
    ) {
      participant = {
        status: 'MATCHED',

        normalizedName:
          registrationParticipant.normalizedName,

        matches:
          registrationParticipant.matches,

        source: 'REGISTRATION',
      };
    } else if (
      registrationParticipant.status ===
      'AMBIGUOUS'
    ) {
      participant = {
        status: 'AMBIGUOUS',

        normalizedName:
          registrationParticipant.normalizedName,

        matches:
          registrationParticipant.matches,

        source: 'REGISTRATION',
      };
    } else {
      participant = {
        ...databaseParticipant,
        source: 'DATABASE',
      };
    }

    const rawClass =
      this.stringValue(
        this.getImportFieldValue(
          row,
          [
            'Класс',
            'class',
            'className',
          ],
        ),
      );

    const className =
      this.mapClassName(
        rawClass,
      );

    const foundClass =
      this.findStageClass(
        className,
        stageClasses,
      );

    const rawResult =
      this.stringValue(
        this.getImportFieldValue(
          row,
          [
            'Результат',
            'Результат, дБ',
            'result',
            'value',
          ],
        ),
      );

    const resultValue =
      this.parseDecimal(
        rawResult,
      );

    const isBassRace =
      className.toLowerCase().startsWith('bassrace');

    const registrationParticipantNumber =
      registrationParticipant.status ===
        'MATCHED' &&
      registrationParticipant.matches[0]
        ?.participantNumber !== null
        ? registrationParticipant.matches[0]
            ?.participantNumber
        : null;

    let participantNumber:
      | number
      | null = null;

    let participantNumberSource:
      | 'RESULT'
      | 'REGISTRATION'
      | 'BOTH'
      | 'AUTO'
      | 'NONE' = 'NONE';

    // A bad source name is ONE actionable issue, not a stack of repeated
    // warnings for the same row (e.g. 34 Sound has digits and is a nickname).
    const warnings: string[] = nameInspection.needsReview
      ? [`Строка ${rowNumber}: проверьте ФИО «${rawName}» (получилось «${nameInspection.normalized}»): ${nameInspection.reasons.join('; ')}`]
      : [];

    if (
      registrationParticipant.status ===
      'MATCHED'
    ) {
      if (resultParticipantNumber !== null) {
        participantNumber = resultParticipantNumber;
        participantNumberSource =
          resultParticipantNumber === registrationParticipantNumber
            ? 'BOTH'
            : 'RESULT';

        if (
          resultParticipantNumber !== registrationParticipantNumber &&
          !isBassRace &&
          !historicalResults
        ) {
          warnings.push(
            'Строка ' + rowNumber + ': номер участника в результате (' + resultParticipantNumber + ') отличается от номера в регистрации (' + registrationParticipantNumber + ')',
          );
        }
      } else if (registrationParticipantNumber !== null) {
        participantNumber = registrationParticipantNumber;
        participantNumberSource = 'REGISTRATION';
      } else if (!historicalResults) {
        warnings.push(
          'Строка ' + rowNumber + ': номер участника отсутствует и в результате, и в регистрации этапа',
        );
      }
    } else if (
      registrationParticipant.status ===
      'AMBIGUOUS'
    ) {
      if (resultParticipantNumber !== null) {
        participantNumber = resultParticipantNumber;
        participantNumberSource = 'RESULT';
      }
      if (!historicalResults) {
        warnings.push(
          'Строка ' + rowNumber + ': несколько регистраций с ФИО "' + rawName + '". Выберите нужную вручную',
        );
      }
      // For historical Results the helper sheet never dictates identity.
      // If helper rows cannot be distinguished, skip uncertain car/vibration
      // metadata. A missing number is allocated from Results using AUTO.

    } else {
      if (resultParticipantNumber !== null) {
        participantNumber = resultParticipantNumber;
        participantNumberSource = 'RESULT';
      }

      if (!historicalResults) {
        warnings.push(
          'Строка ' + rowNumber + ': участник "' + rawName + '" отсутствует в регистрации этого этапа',
        );
      }
    }

    if (
      historicalResults &&
      resultParticipantNumber === null &&
      participantNumber === null
    ) {
      const allocationKey = this.normalizePersonName(rawName);
      const allocated = allocationKey
        ? fallbackParticipantNumbers?.get(allocationKey)
        : undefined;
      if (allocated) {
        participantNumber = allocated;
        participantNumberSource = 'AUTO';
      } else {
        warnings.push(
          'Строка ' + rowNumber + ': в листе результатов отсутствует ФИО для автоматической выдачи номера',
        );
      }
    }

    if (!foundClass) {
      warnings.push(
        `Строка ${rowNumber}: класс "${className}" не подключён к этому этапу`,
      );
    }

    if (
      participant.status ===
      'AMBIGUOUS'
    ) {
      warnings.push(
        `Строка ${rowNumber}: несколько разных карточек участников с ФИО "${rawName}" в базе (${participant.matches.length}). Автоматически выбрать нельзя — укажите правильного участника вручную`,
      );
    }

    if (
      participant.status ===
      'NEW' &&
      !historicalResults
    ) {
      warnings.push(
        `Строка ${rowNumber}: участник "${rawName}" отсутствует в базе`,
      );
    }

    if (resultValue === null) {
      warnings.push(
        `Строка ${rowNumber}: результат "${rawResult}" не удалось определить как число`,
      );
    }

    if (
      resultValue === 0 &&
      !isBassRace
    ) {
      warnings.push(
        `Строка ${rowNumber}: результат равен 0 и требует ручной проверки`,
      );
    }

    let existingResult: any = null;
    let existingResultState: 'NONE' | 'SAME' | 'CONFLICT' = 'NONE';

    if (
      foundClass &&
      participant.status === 'MATCHED' &&
      participant.matches.length === 1 &&
      participantNumber !== null &&
      resultValue !== null
    ) {
      const existingRegistration = await this.prisma.registration.findUnique({
        where: { stageId_participantNumber: { stageId, participantNumber } },
        select: { id: true, participantId: true },
      });

      // В историческом BassRace один и тот же напечатанный номер может
      // встречаться у разных участников. Такой номер не должен превращать
      // строку в конфликт с уже импортированным результатом: при Commit
      // для второго участника будет выдан следующий свободный номер.
      const matchedParticipantId =
        participant.matches?.[0] && 'id' in participant.matches[0]
          ? participant.matches[0].id
          : null;
      const duplicateBassRaceNumber =
        isBassRace &&
        existingRegistration &&
        (matchedParticipantId === null ||
          existingRegistration.participantId !== matchedParticipantId);

      if (existingRegistration && !duplicateBassRaceNumber) {
        const registrationClass = await this.prisma.registrationClass.findUnique({
          where: {
            registrationId_classId: {
              registrationId: existingRegistration.id,
              classId: foundClass.class.id,
            },
          },
          select: { id: true },
        });

        if (registrationClass) {
          existingResult = await this.prisma.result.findUnique({
            where: { registrationClassId: registrationClass.id },
            select: { id: true, value: true, place: true, unit: true },
          });

          if (existingResult) {
            const importedPlace = this.numberValue(this.getImportFieldValue(row, ['Место', 'place']));
            const sameValue = Math.abs(Number(existingResult.value) - Number(resultValue)) < 0.0005;
            const samePlace = (existingResult.place ?? null) === (importedPlace ?? null);

            if (sameValue && samePlace && existingResult.unit === foundClass.class.unit) {
              existingResultState = 'SAME';
              warnings.push(
                `Строка ${rowNumber}: результат уже существует и полностью совпадает с импортируемым. Явно выберите «Оставить существующий» или «Заменить».`,
              );
            } else {
              existingResultState = 'CONFLICT';
              warnings.push(
                `Строка ${rowNumber}: результат уже существует и отличается. В базе: ${Number(existingResult.value)}${existingResult.place !== null ? ` (место ${existingResult.place})` : ''}; в импорте: ${Number(resultValue)}${importedPlace !== null ? ` (место ${importedPlace})` : ''}. Выберите, какой вариант оставить.`,
              );
            }
          }
        }
      }
    }

    return {
      rowNumber,

      status:
        warnings.length > 0
          ? ('WARNING' as const)
          : ('READY' as const),

      participant: {
        rawName,
        ...participant,
      },

      car: {
        // Only trust a name-matched Registration row. A number-only fallback
        // could refer to another participant when historical stickers repeat.
        vibrationIsolation:
          registrationParticipant.status === 'MATCHED' &&
          registrationParticipant.matchType === 'NAME'
            ? registrationParticipant.matches[0]?.car.vibrationIsolation ?? null
            : null,
        model:
          registrationParticipant.status === 'MATCHED' &&
          (!historicalResults || registrationParticipant.matchType === 'NAME')
            ? registrationParticipant.matches[0]?.car.model ?? ''
            : this.stringValue(
                this.getImportFieldValue(row, [
                  'Модель автомобиля',
                  'Модель',
                  'model',
                ]),
              ),
        plateNumber:
          registrationParticipant.status === 'MATCHED' &&
          (!historicalResults || registrationParticipant.matchType === 'NAME')
            ? registrationParticipant.matches[0]?.car.plateNumber ?? ''
            : this.stringValue(
                this.getImportFieldValue(row, [
                  'Номер автомобиля',
                  'Гос. номер',
                  'Гос номер',
                  'Регистрационный номер',
                  'registrationNumber',
                  'plateNumber',
                ]),
              ),
      },

      registration:
        registrationParticipant.status ===
        'MATCHED'
          ? {
              status:
                'MATCHED' as const,

              rowNumber:
                registrationParticipant
                  .matches[0]
                  .rowNumber,

              participantNumber:
                registrationParticipantNumber,

              rawName:
                registrationParticipant
                  .matches[0]
                  .rawName,

              matchType:
                registrationParticipant
                  .matchType,
            }
          : registrationParticipant.status ===
            'AMBIGUOUS'
          ? {
              status:
                'AMBIGUOUS' as const,

              matches:
                registrationParticipant
                  .matches.map(
                    (match) => ({
                      rowNumber:
                        match.rowNumber,

                      rawName:
                        match.rawName,

                      participantNumber:
                        match.participantNumber,
                    }),
                  ),

              matchType:
                registrationParticipant
                  .matchType,
            }
          : {
              status:
                'NOT_FOUND' as const,
            },

      participantNumber,

      participantNumberSource,

      // Historical team is an independent, name-only, unanimous helper match.
      // It never controls selection of a car, email or registration identity.
      historicalTeam,

      classParticipantNumber: participantNumber,
      classNumberSource: 'RESULT_OR_REGISTRATION' as 'RESULT_OR_REGISTRATION' | 'AUTO',

      resultParticipantNumber,

      class: foundClass
        ? {
            status:
              'MATCHED' as const,

            classId:
              foundClass.class.id,

            className:
              foundClass.class.name,

            isBassRace,
          }
        : {
            status:
              'WARNING' as const,

            className,

            isBassRace,
          },

      place:
        this.numberValue(
          this.getImportFieldValue(
            row,
            [
              'Место',
              'place',
            ],
          ),
        ),

      result: resultValue,

      unit: 'DB',

      existingResult: existingResult ? {
        state: existingResultState,
        resultId: existingResult.id,
        value: Number(existingResult.value),
        place: existingResult.place,
        unit: existingResult.unit,
      } : { state: 'NONE' },

      recordAllowed:
        !isBassRace,

      warnings,
    };
  }

  private findStageClass(
    className: string,
    stageClasses: Array<any>,
  ) {
    const normalizedTarget =
      this.normalizeClassName(
        className,
      );

    if (!normalizedTarget) {
      return undefined;
    }

    return stageClasses.find(
      (stageClass) =>
        this.normalizeClassName(
          stageClass?.class?.name ?? '',
        ) === normalizedTarget ||
        this.normalizeClassName(
          stageClass?.class?.code ?? '',
        ) === normalizedTarget,
    );
  }

  private mapClassName(
    value: string,
  ): string {
    const normalized =
      value
        .trim()
        .replace(
          /\s+/g,
          ' ',
        );

    const aliases: Record<
      string,
      string
    > = {
      Limited: 'Limited 2.0',
      Nolim: 'NoLim',
      'Mad-x': 'Mad-X',
      'Mad-X': 'Mad-X',
      'Bass Race 129.9': 'BassRace 129.9',
      'Bass Race 139.9': 'BassRace 139.9',
      'Bass Race 149.9': 'BassRace 149.9',
      'Bass Race 159.9': 'BassRace 159.9',
    };

    return (
      aliases[normalized] ??
      normalized
    );
  }

  private normalizeImportedPlate(value: unknown): string {
    const lookalikes: Record<string, string> = {
      A: 'А', B: 'В', E: 'Е', K: 'К', M: 'М',
      H: 'Н', O: 'О', P: 'Р', C: 'С', T: 'Т',
      Y: 'У', X: 'Х',
    };
    return [...String(value ?? '').normalize('NFKC').toLocaleUpperCase('ru-RU')]
      .map(ch => /[|\s.\-_/\\]/.test(ch) ? '' : (lookalikes[ch] ?? ch))
      .join('')
      .replace(/[^\p{L}\p{N}]/gu, '');
  }

  private normalizeClassName(
    value: string,
  ): string {
    return value
      .trim()
      .replace(/^bdw[\s_-]*spl(?=$|[\s_-])/i, 'BDW')
      .trim()
      .replace(
        /\s+/g,
        ' ',
      )
      .replace(
        /ё/gi,
        'е',
      )
      .toLowerCase();
  }

  private normalizePersonName(
    value: string,
  ): string {
    return this.nameNormalizer.normalize(value)
      .normalize('NFKC')
      .replace(/\u00A0/g, ' ')
      .replace(/\u200B/g, '')
      .replace(/\uFEFF/g, '')
      .replace(/ё/gi, 'е')
      .replace(/[^a-zа-я0-9\s-]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private transliterateRussianName(value: string): string {
    return this.nameNormalizer.toLatin(value);
  }

  private nameAliases(value: string): string[] {
    const normalized = this.normalizePersonName(value);
    const transliterated = this.transliterateRussianName(value);
    return [...new Set([
      normalized,
      transliterated,
      normalized.replace(/\s+/g, ''),
      transliterated.replace(/\s+/g, ''),
    ].filter(Boolean))];
  }

  private levenshtein(a: string, b: string): number {
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 0; i < a.length; i++) {
      let left = i + 1;
      let diagonal = i;
      for (let j = 0; j < b.length; j++) {
        const up = prev[j + 1];
        const cost = a[i] === b[j] ? 0 : 1;
        prev[j + 1] = Math.min(prev[j + 1] + 1, left + 1, diagonal + cost);
        diagonal = up;
        left = prev[j + 1];
      }
    }
    return prev[b.length];
  }

  private findMatchingObjectKey(
    row: Record<string, unknown>,
    target: string,
  ): string | undefined {
    const normalizedTarget =
      String(target ?? '')
        .normalize('NFKC')
        .replace(/\u00A0/g, ' ')
        .replace(/\u200B/g, '')
        .replace(/\uFEFF/g, '')
        .replace(/ё/gi, 'е')
        .replace(
          /[^a-zа-я0-9\s]/gi,
          ' ',
        )
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    if (!normalizedTarget) {
      return undefined;
    }

    for (const key of Object.keys(row)) {
      const normalizedKey =
        String(key)
          .normalize('NFKC')
          .replace(/\u00A0/g, ' ')
          .replace(/\u200B/g, '')
          .replace(/\uFEFF/g, '')
          .replace(/ё/gi, 'е')
          .replace(
            /[^a-zа-я0-9\s]/gi,
            ' ',
          )
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();

      if (
        normalizedKey ===
        normalizedTarget
      ) {
        return key;
      }
    }

    return undefined;
  }

  private getImportFieldValue(
    row: Record<string, unknown>,
    targets: string[],  ): unknown {
    for (const target of targets) {
      if (
        Object.prototype.hasOwnProperty.call(          row,
          target,
        )
      ) {
        return row[target];
      }
    }

    for (const target of targets) {
      const key =
        this.findMatchingObjectKey(
          row,
          target,
        );

      if (key !== undefined) {
        return row[key];
      }
    }

    return undefined;
  }

  private getClassDirectionName(
    stageClass: any,
  ): string | null {
    if (
      stageClass?.direction?.name
    ) {
      return stageClass.direction.name;
    }

    if (
      stageClass?.class?.direction?.name
    ) {
      return stageClass.class.direction.name;
    }

    if (
      stageClass?.class?.directionId
    ) {
      return stageClass.class.directionId;
    }

    return null;
  }

  private stringValue(
    value: unknown,
  ): string {
    if (
      value === null ||
      value === undefined
    ) {
      return '';
    }

    return String(value).trim();
  }

  private numberValue(
    value: unknown,
  ): number | null {
    if (
      value === null ||
      value === undefined ||
      String(value).trim() === ''
    ) {
      return null;
    }

    const parsed =
      Number(
        String(value)
          .replace(
            ',',
            '.',
          )
          .trim(),
      );

    return Number.isFinite(
      parsed,
    )
      ? parsed
      : null;
  }

  private parseDecimal(
    value: string,
  ): number | null {
    if (!value) {
      return null;
    }

    const parsed =
      Number(
        value
          .replace(
            ',',
            '.',
          )
          .trim(),
      );

    return Number.isFinite(
      parsed,
    )
      ? parsed
      : null;
  }

  private toJson(
    value: unknown,
  ): any {
    return JSON.parse(
      JSON.stringify(value),
    );
  }

  private splitFullName(
    value: string,
  ) {
    const parts =
      value
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (
      parts.length === 0
    ) {
      throw new BadRequestException(
        'ФИО участника не может быть пустым',
      );
    }

    return {
      lastName:
        parts[0],

      firstName:
        parts[1] ?? '',

      middleName:
        parts.length > 2
          ? parts
              .slice(2)
              .join(' ')
          : null,
    };
  }

  private normalizedDisplayName(value: string): string {
    return this.nameNormalizer.normalize(value);
  }

  /**
   * A performer alias in a historical results sheet is NOT a real person's
   * name. Keep it verbatim, marked as unverified, so it can be attributed to
   * the correct person later without permanently falsifying their FIO.
   *
   * Scope the synthetic profile to ONE stage, since the same label can be
   * used by different people at different events.
   */
  private async createHistoricalAliasParticipant(
    tx: Prisma.TransactionClient,
    stageId: string,
    rawAlias: string,
    conflictingSticker?: string,
  ) {
    // Archive labels are identities, not personal names. Never run Latin-to-Cyrillic
    // name normalization here: preserve the spelling supplied in Results.
    const alias = this.stringValue(rawAlias).normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (!alias || alias.length > 160 || !this.nameNormalizer.inspect(alias).needsReview) {
      throw new BadRequestException('Укажите корректное архивное название для неизвестного участника');
    }
    const identityKey = archivalAliasKey(alias) +
      (conflictingSticker ? ':conflicting-sticker:' + conflictingSticker : '');
    const globalIdentity = !conflictingSticker ? globalHistoricalAliasKey(alias) : null;
    const legacyId = 'HISTORICAL_ALIAS:' + createHash('sha256')
      .update(globalIdentity ? 'GLOBAL:' + globalIdentity : stageId + ':' + identityKey).digest('hex');
    return tx.participant.upsert({
      where: { legacyId },
      create: {
        legacyId,
        historicalAlias: archivalAliasDisplayLabel(alias),
        lastName: archivalAliasDisplayLabel(alias),
        firstName: '',
        middleName: null,
        isPublic: true,
      },
      update: {},
    });
  }

  private async createParticipantFromImport(
    tx: any,
    participant: {
      fullName?: string;
      team?: string | null;
      email?: string | null;
    },
  ) {
    const inspected = this.nameNormalizer.inspect(
      this.stringValue(participant.fullName),
    );
    if (inspected.needsReview) {
      throw new BadRequestException(
        `Нельзя создать участника с подозрительным ФИО «${inspected.original}»: ${inspected.reasons.join('; ')}. Уточните фамилию и имя в источнике.`,
      );
    }
    const fullName = inspected.normalized;

    const parsedName =
      this.splitFullName(
        fullName,
      );

    // Final DB-level guard: preview matching is not enough. An import can be
    // resolved from a registration/result sheet, so before creating a new
    // Participant we always check the canonical Participant table itself.
    const exactExistingParticipant =
      await tx.participant.findFirst({
        where: {
          lastName: parsedName.lastName,
          firstName: parsedName.firstName,
          ...(parsedName.middleName
            ? { middleName: parsedName.middleName }
            : { middleName: null }),
        },
      });

    /*
     * Last database-level idempotency guard. The preview can be stale or a
     * row can be resolved manually as CREATE. Re-check order-independent,
     * exact normalized/transliterated tokens inside the transaction before
     * inserting, so "Surname Name" and "Name Surname" don't create a second
     * participant. Never guess between multiple candidates.
     */
    const allNameCandidates = exactExistingParticipant
      ? []
      : await tx.participant.findMany({
          select: {
            id: true,
            lastName: true,
            firstName: true,
            middleName: true,
          },
        });

    const targetTokens = this.nameTokens(fullName);
    const equivalentCandidates = allNameCandidates.filter((candidate: {
      id: string;
      lastName: string;
      firstName: string;
      middleName: string | null;
    }) => {
      const fullTokens = this.nameTokens([
        candidate.lastName,
        candidate.firstName,
        candidate.middleName,
      ].filter(Boolean).join(' '));
      const shortTokens = this.nameTokens([
        candidate.lastName,
        candidate.firstName,
      ].filter(Boolean).join(' '));
      const sameTokens = (left: string[], right: string[]) =>
        left.length >= 2 &&
        left.length === right.length &&
        left.every((token) => right.includes(token));

      return sameTokens(targetTokens, fullTokens) ||
        (targetTokens.length === 2 && sameTokens(targetTokens, shortTokens)) ||
        (targetTokens.length >= 3 &&
          !candidate.middleName &&
          shortTokens.length === 2 &&
          shortTokens.every((token) => targetTokens.includes(token)));
    });

    if (!exactExistingParticipant && equivalentCandidates.length > 1) {
      throw new BadRequestException(
        `Нельзя создать участника "${fullName}": найдено несколько существующих участников с тем же нормализованным ФИО. Выберите существующего участника вручную.`,
      );
    }

    const existingParticipant =
      exactExistingParticipant ??
      (equivalentCandidates.length === 1
        ? await tx.participant.findUnique({
            where: { id: equivalentCandidates[0].id },
          })
        : null);

    if (existingParticipant) {
      const email = this.stringValue(participant.email);
      if (email) {
        // participantId is the primary key: a participant can have only one
        // legacy-email row. Upsert is idempotent and avoids P2002 when a later
        // import contains a different email for the same participant.
        await tx.participantLegacyEmail.upsert({
          where: { participantId: existingParticipant.id },
          create: { participantId: existingParticipant.id, email },
          update: {},
        });
      }
      return existingParticipant;
    }

    const createdParticipant =
      await tx.participant.create({
        data: {
          lastName:
            parsedName.lastName,

          firstName:
            parsedName.firstName,

          middleName:
            parsedName.middleName,

          team: this.normalizeImportedTeam(participant.team),
        },
      });

    const email =
      this.stringValue(
        participant.email,
      );

    if (email) {
      await tx.participantLegacyEmail.upsert({
        where: { participantId: createdParticipant.id },
        create: {
          participantId: createdParticipant.id,
          email,
        },
        update: {},
      });
    }

    return createdParticipant;
  }

  async getImportRow(
    importId: string,
    rowId: string,
  ) {
    const row =
      await this.prisma.importRow.findFirst({
        where: {
          id: rowId,
          importJobId: importId,
        },

        include: {
          importJob: {
            include: {
              stage: true,
            },
          },
        },
      });

    if (!row) {
      throw new NotFoundException(
        `ImportRow ${rowId} не найдена`,
      );
    }

    return {
      success: true,
      row,
    };
  }

  async getImportRows(
    importId: string,
    status?: string,
  ) {
    const importJob =
      await this.prisma.importJob.findUnique({
        where: {
          id: importId,
        },

        select: {
          id: true,
          status: true,
          stageId: true,
          createdAt: true,
        },
      });

    if (!importJob) {
      throw new NotFoundException(
        `ImportJob ${importId} не найден`,
      );
    }

    const rows =
      await this.prisma.importRow.findMany({
        where: {
          importJobId: importJob.id,

          ...(status
            ? {
                status: status as any,
              }
            : {}),
        },

        orderBy: [
          {
            type: 'asc',
          },

          {
            rowNumber: 'asc',
          },
        ],
      });

    return {
      success: true,
      importJobId: importJob.id,
      total: rows.length,
      rows,
    };
  }

  private async importVibrationBrand(
    client: Prisma.TransactionClient | PrismaService,
    rawBrand: unknown,
    fromRegistrationSheet = false,
  ): Promise<string | null> {
    if (rawBrand === null || rawBrand === undefined || rawBrand === '') return null;
    if (typeof rawBrand !== 'string' || rawBrand.length > 120) {
      throw new BadRequestException('Некорректная марка виброизоляции');
    }
    const value = rawBrand.trim();
    if (!value || ['не указана', 'не указано', '-', 'нет'].includes(value.toLocaleLowerCase('ru'))) return null;
    const siteSettings = await client.siteSettings.findUnique({
      where: { id: 'default' },
      select: { catalogs: true },
    });
    const catalogs = siteSettings?.catalogs as Record<string, unknown> | null | undefined;
    const brands = Array.isArray(catalogs?.vibrationBrands)
      ? catalogs.vibrationBrands.filter((item): item is string => typeof item === 'string')
      : ['STP', 'ComfortMat', 'Audior', 'Global'];
    const match = brands.find((item) => item.trim().toLocaleLowerCase('ru') === value.toLocaleLowerCase('ru'));
    if (!match) {
      if (fromRegistrationSheet) return value; // preserve original archival source
      throw new BadRequestException('Марка виброизоляции отсутствует в справочнике. Выберите марку из настроек сайта.');
    }
    return match;
  }

  async resolveImportRow(
    importId: string,
    rowId: string,
    resolution: {
      participant?: {
        action:
          | 'USE_EXISTING'
          | 'CREATE'
          | 'CREATE_ALIAS';

        participantId?: string;

        fullName?: string;

        team?: string | null;

        email?: string | null;
      };

      registration?: {
        action:
          | 'USE_EXISTING'
          | 'CREATE';

        registrationId?: string;

        participantNumber?: number;
        primaryParticipantNumber?: number;
      };

      classIds?: string[];

      classId?: string;

      car?: {
        action: 'USE_EXISTING' | 'CREATE';
        carId?: string;
        brand?: string;
        model?: string;
        registrationNumber?: string;
        registrationCountry?: string;
        vibrationIsolation?: string;
      };

      existingResultAction?: 'KEEP_EXISTING' | 'REPLACE';
      value?: number;
      place?: number | null;
      notes?: string | null;
    },
    request?: AuthenticatedRequest,
  ) {
    const row =
      await this.prisma.importRow.findFirst({
        where: {
          id: rowId,
          importJobId: importId,
        },
      });

    if (!row) {
      throw new NotFoundException(
        `ImportRow ${rowId} не найдена`,
      );
    }

    // A failed commit leaves its manually resolved rows in RESOLVED state.
    // Allow an administrator to revise that *uncommitted* decision without
    // creating a fresh import job or changing already committed history.
    if (row.status !== 'WARNING' && row.status !== 'RESOLVED') {
      throw new BadRequestException(
        `Строка ${rowId} уже сохранена и не доступна для сопоставления`,
      );
    }

    if (
      !resolution ||
      typeof resolution !== 'object'
    ) {
      throw new BadRequestException(
        'resolution должен быть объектом',
      );
    }

    if (resolution.participant) {
      if (
        resolution.participant.action ===
          'USE_EXISTING' &&
        !resolution.participant
          .participantId
      ) {
        throw new BadRequestException(
          'Для USE_EXISTING необходимо указать participantId',
        );
      }

      if (
        resolution.participant.action ===
          'CREATE' &&
        !resolution.participant
          .fullName
      ) {
        throw new BadRequestException(
          'Для CREATE необходимо указать fullName участника',
        );
      }
    }

    if (resolution.registration) {
      if (
        resolution.registration.action ===
          'USE_EXISTING' &&
        !resolution.registration
          .registrationId
      ) {
        throw new BadRequestException(
          'Для USE_EXISTING необходимо указать registrationId',
        );
      }

      if (
        resolution.registration.action ===
          'CREATE' &&
        !resolution.registration
          .participantNumber
      ) {
        throw new BadRequestException(
          'Для CREATE необходимо указать participantNumber',
        );
      }
    }

    if (resolution.participant) {
      const action = resolution.participant.action;
      if (action !== 'USE_EXISTING' && action !== 'CREATE' && action !== 'CREATE_ALIAS') {
        throw new BadRequestException('Некорректное действие participant');
      }

      if (
        action === 'USE_EXISTING' &&
        (!resolution.participant.participantId ||
          typeof resolution.participant.participantId !== 'string')
      ) {
        throw new BadRequestException(
          'Для USE_EXISTING необходимо указать participantId',
        );
      }

      if (
        (action === 'CREATE' || action === 'CREATE_ALIAS') &&
        (!resolution.participant.fullName ||
          typeof resolution.participant.fullName !== 'string' ||
          !resolution.participant.fullName.trim())
      ) {
        throw new BadRequestException(
          'Для CREATE необходимо указать непустое ФИО или архивное название',
        );
      }
      if (action === 'CREATE_ALIAS') {
        const job = await this.prisma.importJob.findUnique({
          where: { id: importId },
          select: { metadata: true },
        });
        if (row.type !== 'RESULT' || (job?.metadata as any)?.historicalResults !== true) {
          throw new BadRequestException('Архивное название допустимо только для исторических результатов');
        }
      }
      if (action === 'CREATE_ALIAS' && (
        resolution.participant.fullName!.length > 160 ||
        this.nameNormalizer.inspect(resolution.participant.fullName).needsReview === false
      )) {
        throw new BadRequestException('Архивное название должно быть не более 160 символов и не должно подменять обычное ФИО');
      }
    }

    if (resolution.registration) {
      const action = resolution.registration.action;
      if (action !== 'USE_EXISTING' && action !== 'CREATE') {
        throw new BadRequestException('Некорректное действие registration');
      }

      if (
        action === 'USE_EXISTING' &&
        (!resolution.registration.registrationId ||
          typeof resolution.registration.registrationId !== 'string')
      ) {
        throw new BadRequestException(
          'Для USE_EXISTING необходимо указать registrationId',
        );
      }

      if (
        action === 'CREATE' &&
        (resolution.registration.participantNumber === undefined ||
          !Number.isInteger(resolution.registration.participantNumber) ||
          resolution.registration.participantNumber <= 0)
      ) {
        throw new BadRequestException(
          'Для CREATE необходимо указать положительный номер участника',
        );
      }
    }

    if (resolution.car) {
      const action = resolution.car.action;
      if (action !== 'USE_EXISTING' && action !== 'CREATE') {
        throw new BadRequestException('Некорректное действие car');
      }

      if (
        action === 'USE_EXISTING' &&
        (!resolution.car.carId ||
          typeof resolution.car.carId !== 'string')
      ) {
        throw new BadRequestException(
          'Для USE_EXISTING необходимо указать carId',
        );
      }

      if (action === 'CREATE' &&
        (!resolution.car.brand?.trim() ||
          !resolution.car.model?.trim())
      ) {
        throw new BadRequestException(
          'Для CREATE автомобиля необходимо указать марку и модель',
        );
      }
    }

    if (resolution.car?.vibrationIsolation !== undefined) {
      throw new BadRequestException('Виброизоляция определяется автоматически из листа «Регистрация» и не редактируется в импорте');
    }

    if (resolution.existingResultAction !== undefined &&
      resolution.existingResultAction !== 'KEEP_EXISTING' &&
      resolution.existingResultAction !== 'REPLACE') {
      throw new BadRequestException(
        'Для существующего результата можно выбрать только «Оставить существующий» или «Заменить»',
      );
    }

    if (resolution.value !== undefined) {
      if (
        typeof resolution.value !== 'number' ||
        !Number.isFinite(resolution.value) ||
        resolution.value < 0 ||
        !Number.isInteger(Math.round(resolution.value * 1000))
      ) {
        throw new BadRequestException(
          'Некорректное значение результата',
        );
      }
    }

    if (resolution.place !== undefined && resolution.place !== null) {
      if (
        !Number.isInteger(resolution.place) ||
        resolution.place < 1 ||
        resolution.place > 999
      ) {
        throw new BadRequestException(
          'Место должно быть целым числом от 1 до 999',
        );
      }
    }

    if (resolution.notes !== undefined && resolution.notes !== null) {
      if (
        typeof resolution.notes !== 'string' ||
        resolution.notes.length > 2000
      ) {
        throw new BadRequestException(
          'Комментарий импорта должен быть строкой не длиннее 2000 символов',
        );
      }
    }

    if (
      resolution.classIds !==
      undefined
    ) {      if (
        !Array.isArray(
          resolution.classIds,
        )
      ) {
        throw new BadRequestException(
          'classIds должен быть массивом',
        );
      }

      const invalidClassId =
        resolution.classIds.some(
          (classId) =>
            typeof classId !==
              'string' ||
            !classId.trim(),
        );

      if (invalidClassId) {
        throw new BadRequestException(
          'Все значения classIds должны быть непустыми строками',
        );
      }
    }

    const updatedRow = await this.prisma.importRow.update({
      where: { id: row.id },
      data: { resolution: this.toJson(resolution), status: 'RESOLVED' },
    });

    if (request) {
      await this.prisma.auditLog.create({
        data: {
          userId: request.user.sub,
          action: 'IMPORT_ROW_RESOLVED',
          entity: 'ImportRow',
          entityId: updatedRow.id,
          ipAddress: request.ip,
          metadata: {
            importJobId: importId,
            rowNumber: row.rowNumber,
            status: updatedRow.status,
          },
        },
      });
    }

    return {
      success: true,
      row: updatedRow,
    };
  }

  private async getOrCreateImportCar(
    tx: Prisma.TransactionClient,
    participantId: string,
    row: Record<string, unknown> = {},
  ): Promise<string> {
    const explicitCarId =
      this.stringValue(row.carId);

    if (explicitCarId) {
      const explicitCar =
        await tx.car.findUnique({
          where: { id: explicitCarId },
          select: {
            id: true,
            participantId: true,
            isActive: true,
          },
        });

      if (!explicitCar) {
        throw new BadRequestException(
          `Автомобиль ${explicitCarId} не найден`,
        );
      }

      if (explicitCar.participantId !== participantId) {
        throw new BadRequestException(
          'Выбранный автомобиль принадлежит другому участнику',
        );
      }

      if (!explicitCar.isActive) {
        await tx.car.update({
          where: { id: explicitCar.id },
          data: { isActive: true },
        });
      }

      return explicitCar.id;
    }
    const findValue = (
      targets: string[],
    ): unknown => {
      for (const target of targets) {
        const key =
          this.findMatchingObjectKey(
            row,
            target,
          );

        if (key !== undefined) {
          return row[key];
        }
      }

      return undefined;
    };

    const rawPlate =
      findValue([
        'Номер автомобиля',
        'Гос. номер',
        'Гос номер',
        'Регистрационный номер',
        'registrationNumber',
        'plateNumber',
      ]);

    const rawModel =
      findValue([
        'Модель автомобиля',
        'Модель',        'model',
      ]);

    const rawBrand =
      findValue([        'Марка автомобиля',
        'Марка',
        'brand',
      ]);

    const plateNumber =
      String(rawPlate ?? '')
        .trim()
        .toUpperCase()
        .replace(
          /\s+/g,
          ' ',
        );

    const model =
      String(
        rawModel ?? '',
      ).trim();

    const brand =
      String(
        rawBrand ?? '',
      ).trim();

    if (plateNumber) {
      const participantCars =
        await tx.car.findMany({
          where: { participantId },
          orderBy: { createdAt: 'asc' },
        });
      const existingByPlate =
        participantCars.find(
          (candidate) =>
            this.normalizeImportedPlate(candidate.registrationNumber) ===
            this.normalizeImportedPlate(plateNumber),
        ) ?? null;

      if (existingByPlate) {
        if (
          !existingByPlate.isActive
        ) {
          const restoredCar =
            await tx.car.update({
              where: {
                id:
                  existingByPlate.id,
              },
              data: {
                isActive: true,
              },
            });

          return restoredCar.id;
        }

        return existingByPlate.id;
      }
    }

    if (model && !plateNumber) {
      const existingByModel =
        await tx.car.findFirst({
          where: {
            participantId,
            model,
          },
          orderBy: {
            createdAt: 'asc',
          },
        });

      if (existingByModel) {
        if (
          !existingByModel.isActive
        ) {
          const restoredCar =
            await tx.car.update({
              where: {
                id:
                  existingByModel.id,
              },
              data: {
                isActive: true,
              },
            });

          return restoredCar.id;
        }

        return existingByModel.id;
      }
    }

    if (
      !plateNumber &&
      !model
    ) {
      const technicalRegistrationNumber =
        `IMPORT-${participantId
          .slice(0, 8)
          .toUpperCase()}`;

      const existingTechnicalCar =
        await tx.car.findFirst({
          where: {
            participantId,
            registrationNumber:
              technicalRegistrationNumber,
          },
        });

      if (
        existingTechnicalCar
      ) {
        if (
          !existingTechnicalCar.isActive
        ) {
          const restoredCar =
            await tx.car.update({
              where: {
                id:
                  existingTechnicalCar.id,
              },
              data: {
                isActive: true,
              },
            });

          return restoredCar.id;
        }

        return existingTechnicalCar.id;
      }

      const technicalCar =
        await tx.car.create({
          data: {
            participantId,
            brand: 'Не указано',
            model: 'Не указано',
            registrationNumber:
              technicalRegistrationNumber,
            registrationCountry: 'RU',
            isActive: true,
            isPublic: false,
          },
        });

      return technicalCar.id;
    }

    const newCar =
      await tx.car.create({
        data: {
          participantId,
          brand:
            brand || 'Не указано',
          model:
            model || 'Не указано',
          registrationNumber:
            plateNumber ||
            `IMPORT-${participantId
              .slice(0, 8)
              .toUpperCase()}`,
          registrationCountry:
            (this.stringValue(row.registrationCountry) as RegistrationCountry) || RegistrationCountry.RU,
          isActive: true,
          isPublic: false,
        },
      });

    return newCar.id;
  }

  private async ensureLegacyImportConfiguration(
    tx: Prisma.TransactionClient,
    carId: string,
    vibrationIsolation?: string,
  ) {
    const name = 'LEGACY_IMPORT';
    const brand = await this.importVibrationBrand(tx, vibrationIsolation, true);

    let configuration = await tx.carConfiguration.findFirst({
      where: {
        carId,
        name,
      },
    });

    if (!configuration) {
      configuration = await tx.carConfiguration.create({
        data: {
          carId,
          name,
          currentVersion: 1,
        },
      });
    }

    let version: (Prisma.CarConfigurationVersionGetPayload<{}> & { historicalConfirmations?: { id: string }[] }) | null = await tx.carConfigurationVersion.findFirst({
      where: {
        configurationId: configuration.id,
        version: configuration.currentVersion,
      },
      include: { historicalConfirmations: { select: { id: true } } },
    });

    if (!version) {
      version = await tx.carConfigurationVersion.create({
        data: {
          configurationId: configuration.id,
          version: configuration.currentVersion,
          vibrationIsolation: brand,
          additionalDescription:
            'LEGACY_IMPORT: точная конфигурация автомобиля в историческом импорте отсутствовала.',
        },
      });
    }

    if (version && ((version.vibrationIsolation ?? null) !== brand || version.historicalConfirmations?.length)) {
      // Never rewrite a configuration version used by an earlier registration.
      const alreadyUsed = version.historicalConfirmations?.length || await tx.registration.count({
        where: { configurationVersionId: version.id },
      });
      if (alreadyUsed > 0) {
        const nextVersion = configuration.currentVersion + 1;
        version = await tx.carConfigurationVersion.create({
          data: {
            configurationId: configuration.id,
            version: nextVersion,
            vibrationIsolation: brand,
            additionalDescription: 'LEGACY_IMPORT: виброизоляция из новой исторической регистрации или не указана.',
          },
        });
        configuration = await tx.carConfiguration.update({
          where: { id: configuration.id },
          data: { currentVersion: nextVersion },
        });
      } else {
        version = await tx.carConfigurationVersion.update({
          where: { id: version.id },
          data: { vibrationIsolation: brand },
        });
      }
    }

    return {
      configuration,
      version,
    };
  }

  private async allocateFreeImportNumber(
    tx: Prisma.TransactionClient,
    stageId: string,
    preferredNumber: number,
  ): Promise<number> {
    const [numberRows, registrations] = await Promise.all([
      tx.registrationNumber.findMany({
        where: { stageId },
        select: { number: true },
        orderBy: { number: 'asc' },
      }),
      tx.registration.findMany({
        where: { stageId },
        select: { participantNumber: true },
      }),
    ]);

    const used = new Set([
      ...numberRows.map((row) => row.number),
      ...registrations.map((registration) => registration.participantNumber),
    ]);
    let candidate = preferredNumber;

    if (!Number.isInteger(candidate) || candidate <= 0) {
      candidate = 1;
    }

    while (used.has(candidate)) {
      candidate += 1;
    }

    return candidate;
  }

  /**
   * BassRace в историческом архиве допускает повторение напечатанного номера
   * между заездами/участниками. При конфликте внутри одного этапа выдаём
   * следующий номер после максимального номера, уже использованного результатами
   * этапа, а не просто ближайший свободный номер от исходного.
   */
  private async allocateNextHistoricalBassRaceNumber(
    tx: Prisma.TransactionClient,
    stageId: string,
    maxSourceNumber = 0,
  ): Promise<number> {
    const [resultRows, registrationNumbers] = await Promise.all([
      tx.result.findMany({
        where: {
          registration: {
            stageId,
          },
        },
        select: {
          registration: {
            select: {
              participantNumber: true,
            },
          },
          registrationClass: {
            select: {
              number: {
                select: {
                  number: true,
                },
              },
            },
          },
        },
      }),
      tx.registrationNumber.findMany({
        where: { stageId },
        select: { number: true },
      }),
    ]);

    let maxNumber = 0;

    for (const row of resultRows) {
      maxNumber = Math.max(
        maxNumber,
        row.registration.participantNumber,
        row.registrationClass.number.number,
      );
    }

    for (const row of registrationNumbers) {
      maxNumber = Math.max(maxNumber, row.number);
    }

    return Math.max(maxNumber, maxSourceNumber) + 1;
  }

  /**
   * Historical BassRace classes may share one Registration but must not share
   * the class sticker after the first distinct BassRace class. Allocate after
   * the maximum number in the input spreadsheet AND current stage; never
   * steal a printed number from a result row that has not committed yet.
   */
  private async resolveHistoricalBassRaceClassNumber(
    tx: Prisma.TransactionClient,
    stageId: string,
    registrationId: string,
    classId: string,
    preferredNumber: number,
    maxSourceNumber: number,
  ): Promise<number> {
    const existingClass = await tx.registrationClass.findUnique({
      where: { registrationId_classId: { registrationId, classId } },
      select: { number: { select: { number: true } } },
    });
    if (existingClass) return existingClass.number.number;

    const priorClasses = await tx.registrationClass.findMany({
      where: { registrationId },
      select: { class: { select: { name: true } } },
    });
    const hasAnotherBassRace = priorClasses.some((row) =>
      row.class.name.trim().toLowerCase().replace(/[\s_-]+/g, '').startsWith('bassrace'));

    const occupiedClassNumber = await tx.registrationNumber.findUnique({
      where: { stageId_number: { stageId, number: preferredNumber } },
      select: { registrationId: true },
    });

    if (hasAnotherBassRace ||
      (occupiedClassNumber && occupiedClassNumber.registrationId !== registrationId)) {
      return this.allocateNextHistoricalBassRaceNumber(tx, stageId, maxSourceNumber);
    }
    return preferredNumber;
  }

  private async ensureRegistrationNumber(
    tx: Prisma.TransactionClient,
    data: {
      stageId: string;
      registrationId: string;
      number: number;
      isPrimary: boolean;
    },
  ) {
    if (!Number.isInteger(data.number) || data.number <= 0) {
      throw new BadRequestException('Номер участника должен быть положительным целым числом');
    }

    const existing = await tx.registrationNumber.findUnique({
      where: {
        stageId_number: {
          stageId: data.stageId,
          number: data.number,
        },
      },
    });

    if (existing) {
      if (existing.registrationId !== data.registrationId) {
        throw new BadRequestException(
          'Номер участника ' + data.number + ' уже зарезервирован другой регистрацией на этом этапе',
        );
      }
      if (data.isPrimary && !existing.isPrimary) {
        throw new BadRequestException(
          'Номер участника ' + data.number + ' уже используется как дополнительный номер этой регистрации',
        );
      }
      return existing;
    }

    return tx.registrationNumber.create({
      data: {
        id: randomUUID(),
        stageId: data.stageId,
        registrationId: data.registrationId,
        number: data.number,
        isPrimary: data.isPrimary,
      },
    });
  }

  private async createImportRegistration(
    tx: Prisma.TransactionClient,
    data: {
      stageId: string;
      participantId: string;
      carId: string;
      participantNumber: number;
      vibrationIsolation?: string;
    },
  ) {
    const { configuration, version } =
      await this.ensureLegacyImportConfiguration(
        tx,
        data.carId,
        data.vibrationIsolation,
      );

    const configurationSnapshot = {
      configurationId: configuration.id,
      configurationName: configuration.name,
      version: version.version,
      vibrationIsolation: version.vibrationIsolation,
      additionalDescription: version.additionalDescription,
      headUnits: [],
      audioComponents: [],
      amplifiers: [],
      batteries: [],
      generators: [],
      legacyImport: true,
      configurationAvailable: false,
    };

    try {
      // Historical imports may encounter stale reservations from earlier attempts.
      // Resolve the conflict before creating the registration itself.
      let participantNumber = data.participantNumber;
      const reserved = await tx.registrationNumber.findUnique({
        where: {
          stageId_number: {
            stageId: data.stageId,
            number: participantNumber,
          },
        },
        select: { registrationId: true },
      });
      const occupiedRegistration = await tx.registration.findUnique({
        where: {
          stageId_participantNumber: {
            stageId: data.stageId,
            participantNumber,
          },
        },
        select: { id: true },
      });

      if (reserved || occupiedRegistration) {
        participantNumber = await this.allocateFreeImportNumber(
          tx,
          data.stageId,
          participantNumber + 1,
        );
      }

      const registration = await tx.registration.create({
        data: {
          stageId: data.stageId,
          participantId: data.participantId,
          carId: data.carId,
          configurationVersionId: version.id,
          configurationSnapshot,
          participantNumber,
          source: 'IMPORT',
          status: 'ACTIVE',
        },
      });

      await this.ensureRegistrationNumber(tx, {
        stageId: data.stageId,
        registrationId: registration.id,
        number: participantNumber,
        isPrimary: true,
      });

      return registration;
    } catch (error) {
      if (
        !(
          error instanceof
          Prisma.PrismaClientKnownRequestError
        ) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }

      const existing =
        await tx.registration.findUnique({
          where: {
            stageId_carId: {
              stageId: data.stageId,
              carId: data.carId,
            },
          },
        });

      if (!existing) {
        throw error;
      }

      if (
        existing.participantId !==
        data.participantId
      ) {
        throw new BadRequestException(
          'Автомобиль уже зарегистрирован на этом этапе за другим участником',
        );
      }

      if (
        existing.participantNumber !==
        data.participantNumber
      ) {
        throw new BadRequestException(
          `Автомобиль уже зарегистрирован на этом этапе под номером ${existing.participantNumber}; в импорте указан номер ${data.participantNumber}`,
        );
      }

      if (
        existing.status ===
        'CANCELLED'
      ) {
        return await tx.registration.update({
          where: {
            id: existing.id,
          },
          data: {
            status: 'ACTIVE',
            source: 'IMPORT',
            registeredAt: new Date(),
            configurationVersionId: version.id,
            configurationSnapshot,
          },
        });
      }

      return existing;
    }
  }

  /**
   * Second validation pass for rows that were manually resolved.
   *
   * WARNING -> RESOLVED -> this validation -> COMMITTED.
   * We intentionally re-read all referenced entities inside the same
   * transaction as the commit so a stale/deleted/moved entity cannot
   * silently pass because the preview was created earlier.
   */
  private async validateResolvedRowsForCommit(
    tx: Prisma.TransactionClient,
    importJob: {
      stageId: string;
      metadata?: unknown;
      rows: Array<{
        id: string;
        type: 'REGISTRATION' | 'RESULT';
        rowNumber: number;
        status: 'READY' | 'WARNING' | 'RESOLVED' | 'COMMITTED';
        resolution: unknown;
      }>;
    },
  ) {
    const resolvedRows = importJob.rows.filter(
      (row) => row.status === 'RESOLVED',
    );

    for (const row of resolvedRows) {
      const resolution = row.resolution as any;

      if (!resolution || typeof resolution !== 'object') {
        throw new BadRequestException(
          `Строка ${row.rowNumber}: отсутствует решение администратора`,
        );
      }

      let participantId: string | null = null;

      if (resolution.participant?.action === 'USE_EXISTING') {
        const selectedParticipantId = resolution.participant.participantId;

        if (typeof selectedParticipantId !== 'string' || !selectedParticipantId) {
          throw new BadRequestException(
            `Строка ${row.rowNumber}: не указан существующий участник`,
          );
        }

        participantId = selectedParticipantId;

        const participant = await tx.participant.findUnique({
          where: { id: selectedParticipantId },
          select: { id: true },
        });

        if (!participant) {
          throw new BadRequestException(
            `Строка ${row.rowNumber}: выбранный участник больше не существует`,
          );
        }
      } else if (resolution.participant?.action === 'CREATE' ||
        resolution.participant?.action === 'CREATE_ALIAS') {
        const name = resolution.participant.fullName;
        if (typeof name !== 'string' || !name.trim()) {
          throw new BadRequestException(
            `Строка ${row.rowNumber}: для нового участника не указано ФИО или архивное название`,
          );
        }
        if (resolution.participant.action === 'CREATE_ALIAS') {
          if ((importJob.metadata as any)?.historicalResults !== true || row.type !== 'RESULT') {
            throw new BadRequestException(
              `Строка ${row.rowNumber}: архивный псевдоним допустим только в исторических результатах`,
            );
          }
          if (name.trim().length > 160 ||
              !this.nameNormalizer.inspect(name).needsReview) {
            throw new BadRequestException(
              `Строка ${row.rowNumber}: архивное название не подходит для ручного режима псевдонима`,
            );
          }
        }
      }

      if (resolution.registration?.action === 'USE_EXISTING') {
        const registration =
          await tx.registration.findUnique({
            where: {
              id: resolution.registration.registrationId,
            },
            select: {
              id: true,
              stageId: true,
              participantId: true,
              participantNumber: true,
              status: true,
            },
          });

        if (!registration) {
          throw new BadRequestException(
            `Строка ${row.rowNumber}: выбранная регистрация больше не существует`,
          );
        }

        if (registration.stageId !== importJob.stageId) {
          throw new BadRequestException(
            `Строка ${row.rowNumber}: выбранная регистрация относится к другому этапу`,
          );
        }

        if (
          participantId &&
          registration.participantId !== participantId
        ) {
          throw new BadRequestException(
            `Строка ${row.rowNumber}: регистрация принадлежит другому участнику`,
          );
        }

        if (registration.status !== 'ACTIVE') {
          throw new BadRequestException(
            `Строка ${row.rowNumber}: выбранная регистрация неактивна`,
          );
        }
      } else if (
        resolution.registration?.action === 'CREATE' &&
        (!Number.isInteger(
          resolution.registration.participantNumber,
        ) ||
          resolution.registration.participantNumber <= 0)
      ) {
        throw new BadRequestException(
          `Строка ${row.rowNumber}: некорректный номер участника`,
        );
      }

      if (resolution.car?.action === 'USE_EXISTING') {
        const car = await tx.car.findUnique({
          where: { id: resolution.car.carId },
          select: {
            id: true,
            participantId: true,
          },
        });

        if (!car) {
          throw new BadRequestException(
            `Строка ${row.rowNumber}: выбранный автомобиль больше не существует`,
          );
        }

        if (
          participantId &&
          car.participantId !== participantId
        ) {
          throw new BadRequestException(
            `Строка ${row.rowNumber}: автомобиль принадлежит другому участнику`,
          );
        }
      } else if (resolution.car?.action === 'CREATE') {
        if (
          typeof resolution.car.brand !== 'string' ||
          !resolution.car.brand.trim() ||
          typeof resolution.car.model !== 'string' ||
          !resolution.car.model.trim()
        ) {
          throw new BadRequestException(
            `Строка ${row.rowNumber}: недостаточно данных для создания автомобиля`,
          );
        }

        if (
          resolution.car.registrationCountry !== undefined &&
          typeof resolution.car.registrationCountry !== 'string'
        ) {
          throw new BadRequestException(
            `Строка ${row.rowNumber}: некорректная страна регистрации автомобиля`,
          );
        }
      }

      const classIds = [
        ...(Array.isArray(resolution.classIds)
          ? resolution.classIds
          : []),
        ...(typeof resolution.classId === 'string'
          ? [resolution.classId]
          : []),
      ];

      for (const classId of [...new Set(classIds)]) {
        const stageClass = await tx.stageClass.findUnique({
          where: {
            stageId_classId: {
              stageId: importJob.stageId,
              classId,
            },
          },
          select: {
            id: true,
            isActive: true,
            class: {
              select: {
                id: true,
                isActive: true,
                unit: true,
              },
            },
          },
        });

        if (
          !stageClass ||
          !stageClass.isActive ||
          !stageClass.class.isActive
        ) {
          throw new BadRequestException(
            `Строка ${row.rowNumber}: выбранный класс больше не доступен на этапе`,
          );
        }
      }

      if (resolution.value !== undefined) {
        if (
          typeof resolution.value !== 'number' ||
          !Number.isFinite(resolution.value) ||
          resolution.value < 0 ||
          !Number.isInteger(
            Math.round(resolution.value * 1000),
          )
        ) {
          throw new BadRequestException(
            `Строка ${row.rowNumber}: некорректное значение результата`,
          );
        }
      }

      if (
        resolution.place !== undefined &&
        resolution.place !== null &&
        (!Number.isInteger(resolution.place) ||
          resolution.place < 1 ||
          resolution.place > 999)
      ) {
        throw new BadRequestException(
          `Строка ${row.rowNumber}: некорректное место`,
        );
      }

      if (
        resolution.notes !== undefined &&
        resolution.notes !== null &&
        (typeof resolution.notes !== 'string' ||
          resolution.notes.length > 2000)
      ) {
        throw new BadRequestException(
          `Строка ${row.rowNumber}: комментарий слишком длинный`,
        );
      }
    }
  }

  async commitImport(
    importId: string,
    request?: AuthenticatedRequest,
    options?: { allowHistoricalPartial?: boolean },
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        // Serialize commits of the same import job. Without a row lock,
        // two concurrent requests could both observe DRAFT and execute the
        // expensive commit path before one of them hits a later unique constraint.
        await tx.$queryRaw`
          SELECT id
          FROM "ImportJob"
          WHERE id = ${importId}
          FOR UPDATE
        `;

        const importJob =
          await tx.importJob.findUnique({
            where: {
              id: importId,
            },

            include: {
              stage: true,

              rows: {
                orderBy: [
                  {
                    type: 'asc',
                  },

                  {
                    rowNumber: 'asc',
                  },
                ],
              },
            },
          });

        if (!importJob) {
          throw new NotFoundException(
            `ImportJob ${importId} не найден`,
          );
        }

        const historicalResults =
          (importJob.metadata as any)?.historicalResults === true;
        const archivalStickerConflicts = historicalResults
          ? historicalAliasStickerDiscriminators(importJob.rows, this.nameNormalizer)
          : new Map<string, string>();

        if ((importJob.metadata as any)?.source === 'HISTORICAL_XLSX' && !historicalResults) {
          throw new BadRequestException('Устаревший режим исторического импорта: подготовьте архив заново');
        }
        // Registration rows enrich Results; they are never commit candidates.
        const globalBatch = historicalResults && typeof (importJob.metadata as any)?.globalBatchId === 'string';
        const partial = options?.allowHistoricalPartial === true && globalBatch;
        if (options?.allowHistoricalPartial && !globalBatch) {
          throw new BadRequestException('Частичное подтверждение разрешено только общей задаче архива');
        }
        const commitRows = importJob.rows.filter((row) =>
          (!historicalResults || row.type === 'RESULT') &&
          (!globalBatch || row.status !== 'COMMITTED') &&
          (!partial || row.status === 'READY' || row.status === 'RESOLVED'),
        );
        const pendingResults = globalBatch ? importJob.rows.filter((row) => row.type === 'RESULT' && row.status === 'WARNING').length : 0;
        const finalStatus = partial && pendingResults ? 'DRAFT' as const : 'COMMITTED' as const;
        // Older previews copied a different person's car from a shared sticker.
        // Do not replay those saved resolutions after fixing the preview policy.
        if (historicalResults && (importJob.metadata as any)?.carMetadataPolicy !== 'REGISTRATION_NAME_REQUIRED_V1') {
          const unsafeCarRows = commitRows.filter((row) => {
            const normalized = row.normalizedData as any;
            return normalized?.registration?.matchType === 'NUMBER' &&
              (this.stringValue(normalized?.car?.model) || this.stringValue(normalized?.car?.plateNumber));
          });
          if (unsafeCarRows.length) {
            throw new BadRequestException('Устаревшее сопоставление автомобилей по номеру участника: подготовьте архив заново');
          }
        }

        if (
          importJob.status !==
          'DRAFT'
        ) {
          throw new BadRequestException(
            `Импорт ${importId} нельзя выполнить: статус ${importJob.status}`,
          );
        }

        const unresolvedRows =
          commitRows.filter(
            (row) =>
              row.status === 'WARNING' &&
              (!historicalResults || row.type === 'RESULT'),
          );

        if (
          unresolvedRows.length >
          0
        ) {
          throw new BadRequestException(
            `В импорте остались нерешённые строки: ${unresolvedRows.length}`,
          );
        }

        /*
         * RESOLVED означает не просто "админ сменил статус".
         * Для каждой такой строки обязательно должно сохраниться
         * конкретное решение, которое затем повторно проверяется
         * ниже во время commit внутри транзакции.
         *
         * Это второй контур проверки:
         * WARNING -> RESOLVED -> повторная проверка -> COMMITTED.
         */
        const invalidResolvedRows =
          commitRows.filter(
            (row) =>
              row.status === 'RESOLVED' &&
              (!row.resolution ||
                typeof row.resolution !== 'object'),
          );

        if (
          invalidResolvedRows.length >
          0
        ) {
          throw new BadRequestException(
            `Найдены строки RESOLVED без сохранённого решения: ${invalidResolvedRows
              .map((row) => row.rowNumber)
              .join(', ')}`,
          );
        }

        const unsupportedStatuses =
          commitRows.filter(
            (row) =>
              row.status !== 'READY' &&
              row.status !== 'RESOLVED',
          );

        if (
          unsupportedStatuses.length >
          0
        ) {
          throw new BadRequestException(
            `Импорт содержит строки, не готовые к подтверждению: ${unsupportedStatuses
              .map((row) => row.rowNumber)
              .join(', ')}`,
          );
        }

        await this.validateResolvedRowsForCommit(
          tx,
          { ...importJob, rows: commitRows },
        );


        /*
         * Блокируем этап на время Commit.
         *
         * Это защищает от двух одновременных импортов,
         * которые пытаются выдать один и тот же номер
         * или зарегистрировать один автомобиль.
         */
        await tx.$queryRaw<{ locked: string }[]>`SELECT pg_advisory_xact_lock(hashtext(${importJob.stageId}))::text AS locked`;

        const historicalMaxSourceNumber = Math.max(0, ...importJob.rows.map((row) =>
          this.parseParticipantNumber(
            (row.normalizedData as any)?.resultParticipantNumber ??
            (row.normalizedData as any)?.participantNumber ??
            this.getImportFieldValue(row.rawData as ImportRow, [
              'Номер', 'Номер участника', '№ участника', 'participantNumber',
            ]),
          ) ?? 0,
        ));

        const importedParticipants =
          new Map<
            string,
            string
          >();

        const importedRegistrations =
          new Map<
            string,
            string
          >();

        const importedRegistrationsByNumber =
          new Map<
            number,
            string
          >();

        const committedRows:
          Array<{
            rowId: string;
            type: string;
            participantId: string;
            registrationId: string;
            classId?: string;
            resultId?: string;
          }> = [];

        /*
         * =====================================================
         * 1. REGISTRATION
         * =====================================================
         */
        for (const row of importJob.rows) {
          if (historicalResults) {
            continue;
          }

          if (
            row.type !==
            'REGISTRATION'
          ) {
            continue;
          }

          if (
            row.status !==
              'READY' &&
            row.status !==
              'RESOLVED'
          ) {
            continue;
          }

          const normalized =
            row.normalizedData as any;

          const resolution =
            row.resolution as any;

          const rawData =
            row.rawData as any;

          let participantId:
            | string
            | null = null;

          if (
            resolution
              ?.participant
              ?.action ===
            'USE_EXISTING'
          ) {
            participantId =
              resolution
                .participant
                .participantId;
          }

          if (
            resolution
              ?.participant
              ?.action ===
            'CREATE'
          ) {
            const participant =
              await this.createParticipantFromImport(
                tx,
                {
                  fullName:
                    resolution
                      .participant
                      .fullName,

                  team:
                    resolution
                      .participant
                      .team ??
                    null,
                  email:
                    resolution
                      .participant
                      .email ??
                    null,
                },              );

            participantId =
              participant.id;
          }

          if (
            !participantId &&
            normalized
              ?.participant
              ?.matches
              ?.length
          ) {
            participantId =
              normalized
                .participant
                .matches[0]
                .id;
          }

          const rawName =
            this.stringValue(
              this.getImportFieldValue(
                rawData,
                [
                  'Фамилия и имя',
                  'ФИО',
                  'Фамилия Имя',
                  'Участник',
                  'participantName',
                ],
              ),
            ) ||
            this.stringValue(
              normalized
                ?.participant
                ?.rawName,
            );

          const normalizedName =
            this.normalizePersonName(
              rawName,
            );

          if (
            !participantId &&
            normalizedName
          ) {
            participantId =
              importedParticipants.get(
                normalizedName,
              ) ?? null;
          }

          if (!participantId) {
            throw new BadRequestException(
              `Не удалось определить участника для регистрации, строка ${row.rowNumber}`,
            );
          }

          if (normalizedName) {
            importedParticipants.set(
              normalizedName,
              participantId,
            );
          }

          const resolutionNumber =
            resolution
              ?.registration
              ?.participantNumber;

          const participantNumber =
            resolutionNumber ??
            normalized
              ?.participantNumber ??
            this.parseParticipantNumber(
              this.getImportFieldValue(
                rawData,
                [
                  'Номер участника',
                  '№ участника',
                  'Номер',
                  'participantNumber',
                ],
              ),
            );

          if (
            participantNumber ===
              null ||
            participantNumber ===
              undefined
          ) {
            throw new BadRequestException(
              `Не указан номер участника для регистрации, строка ${row.rowNumber}`,
            );
          }

          if (
            participantNumber <=
            0
          ) {
            throw new BadRequestException(
              `Некорректный номер участника для строки ${row.rowNumber}: ${participantNumber}`,
            );
          }

          const carData = {
            carId:
              resolution?.car?.action === 'USE_EXISTING'
                ? resolution.car.carId
                : undefined,

            brand:
              resolution?.car?.action === 'CREATE'
                ? this.stringValue(resolution.car.brand)
                : undefined,

            model:
              resolution?.car?.action === 'CREATE'
                ? this.stringValue(resolution.car.model)
                : this.stringValue(
                    normalized
                      ?.car
                      ?.model ??
                    this.getImportFieldValue(
                      rawData,
                      [
                        'Модель автомобиля',
                        'Модель',
                        'model',
                      ],
                    ),
                  ),

            plateNumber:
              resolution?.car?.action === 'CREATE'
                ? this.stringValue(resolution.car.registrationNumber)
                : this.stringValue(
                    normalized
                      ?.car
                      ?.plateNumber ??
                    this.getImportFieldValue(
                      rawData,
                      [
                        'Номер автомобиля',
                        'Гос. номер',
                        'Гос номер',
                        'Регистрационный номер',
                        'registrationNumber',
                        'plateNumber',
                      ],
                    ),
                  ),

            registrationCountry:
              resolution?.car?.action === 'CREATE'
                ? this.stringValue(resolution.car.registrationCountry) || 'RU'
                : 'RU',
          };

          const carId =
            await this.getOrCreateImportCar(
              tx,
              participantId,
              carData,
            );

          let registrationId:
            | string
            | null = null;

          /*
           * Флаг перераспределения номера в историческом импорте.
           * Нужен ниже, когда первичный номер результата применяется
           * к уже найденной/созданной регистрации.
           */
          let historicalNumberAllocated = false;

          /*
           * Явное ручное разрешение:
           * USE_EXISTING.
           */
          if (
            resolution
              ?.registration
              ?.action ===
            'USE_EXISTING'
          ) {
            registrationId =
              resolution
                .registration
                .registrationId;

            if (
              registrationId
            ) {
              const existing =
                await tx.registration.findUnique(
                  {
                    where: {
                      id:
                        registrationId,
                    },

                    select: {
                      id: true,
                      participantId:
                        true,
                      stageId: true,
                      carId: true,
                      participantNumber:
                        true,
                      status: true,
                    },
                  },
                );

              if (!existing) {
                throw new BadRequestException(
                  `Регистрация ${registrationId} не найдена`,
                );
              }

              if (
                existing.stageId !==
                importJob.stageId
              ) {
                throw new BadRequestException(
                  `Регистрация ${registrationId} относится к другому этапу`,
                );
              }

              if (
                existing.participantId !==
                participantId
              ) {
                throw new BadRequestException(
                  `Регистрация ${registrationId} принадлежит другому участнику`,
                );
              }

              if (
                existing.carId !==
                carId
              ) {
                throw new BadRequestException(
                  `Регистрация ${registrationId} привязана к другому автомобилю`,
                );
              }

              if (
                existing.status ===
                'CANCELLED'
              ) {
                await tx.registration.update(
                  {
                    where: {
                      id:
                        existing.id,
                    },
                    data: {
                      status:
                        'ACTIVE',
                      source:
                        'IMPORT',
                      registeredAt:
                        new Date(),
                    },
                  },
                );
              }
            }
          }

          /*
           * Сначала ищем по stage + participantNumber.
           */
          if (!registrationId) {
            const existing =
              await tx.registration.findUnique(
                {
                  where: {
                    stageId_participantNumber:
                      {
                        stageId:
                          importJob.stageId,

                        participantNumber,
                      },
                  },
                },
              );

            if (existing) {
              if (
                existing.participantId !==
                participantId
              ) {
                throw new BadRequestException(
                  `Номер участника ${participantNumber} уже принадлежит другому участнику на этом этапе`,
                );
              }

              /*
               * Если номер принадлежит этому участнику,
               * но регистрация относится к другой машине,
               * молча менять машину нельзя.
               */
              if (
                existing.carId !==
                carId
              ) {
                throw new BadRequestException(
                  `Номер участника ${participantNumber} уже зарегистрирован на другом автомобиле на этом этапе`,
                );
              }

              registrationId =
                existing.id;

              if (
                existing.status ===
                'CANCELLED'
              ) {
                await tx.registration.update(
                  {
                    where: {
                      id:
                        existing.id,
                    },
                    data: {
                      status:
                        'ACTIVE',
                      source:
                        'IMPORT',
                      registeredAt:
                        new Date(),
                    },
                  },
                );
              }
            }
          }

          /*
           * Критически важная проверка:
           * один автомобиль не может иметь две регистрации
           * на одном этапе.
           */
          if (!registrationId) {
            const existingRegistrationByCar =
              await tx.registration.findUnique(
                {
                  where: {
                    stageId_carId: {
                      stageId:
                        importJob.stageId,
                      carId,
                    },
                  },
                },
              );

            if (
              existingRegistrationByCar
            ) {
              if (
                existingRegistrationByCar.participantId !==
                participantId
              ) {
                throw new BadRequestException(
                  'Автомобиль уже зарегистрирован на этом этапе за другим участником',
                );
              }

              const rowClassName = this.stringValue(
                normalized?.class?.className ??
                normalized?.class?.name ??
                normalized?.className,
              ).trim().toLowerCase();
              const rowIsBassRace = rowClassName.startsWith('bassrace');

              if (
                existingRegistrationByCar.status ===
                'ACTIVE' &&
                !rowIsBassRace
              ) {
                throw new BadRequestException(
                  `Автомобиль уже зарегистрирован на этом этапе. Номер участника: ${existingRegistrationByCar.participantNumber}`,
                );
              }

              /*
               * CANCELLED → восстанавливаем ту же регистрацию
               * и обязательно сохраняем её старый номер.
               */
              registrationId =
                existingRegistrationByCar.id;

              await tx.registration.update(
                {
                  where: {
                    id:
                      existingRegistrationByCar.id,
                  },
                  data: {
                    status:
                      'ACTIVE',
                    source:
                      'IMPORT',
                    registeredAt:
                      new Date(),
                  },
                },
              );
            }
          }

          /*
           * Если регистрации действительно нет —
           * создаём новую.
           */
          if (!registrationId) {
            const registration =
              await this.createImportRegistration(
                tx,
                {
                  stageId:
                    importJob.stageId,
                  participantId,
                  carId,
                  participantNumber,
                  vibrationIsolation: historicalResults ? this.stringValue(normalized?.car?.vibrationIsolation) : this.stringValue(this.getImportFieldValue(rawData, ['Виброизоляция', 'vibrationIsolation'])),
                },
              );

            registrationId =
              registration.id;
          }

          if (normalizedName) {
            importedRegistrations.set(
              normalizedName,
              registrationId,
            );
          }

          importedRegistrationsByNumber.set(
            participantNumber,
            registrationId,
          );

          if (
            historicalResults &&
            registrationId &&
            participantNumber > 0 &&
            normalized?.class?.isBassRace !== true
          ) {
            const historicalRegistration = await tx.registration.findUnique({
              where: { id: registrationId },
              select: { id: true, participantId: true, participantNumber: true },
            });

            if (
              historicalRegistration &&
              historicalRegistration.participantNumber !== participantNumber
            ) {
              const occupiedNumber = await tx.registrationNumber.findUnique({
                where: {
                  stageId_number: {
                    stageId: importJob.stageId,
                    number: participantNumber,
                  },
                },
              });

              if (occupiedNumber && occupiedNumber.registrationId !== registrationId) {
                throw new BadRequestException(
                  'Строка ' + row.rowNumber + ': номер участника ' + participantNumber + ' уже зарезервирован другой регистрацией',
                );
              }

              await tx.registration.update({
                where: { id: registrationId },
                data: { participantNumber },
              });

              await tx.registrationNumber.updateMany({
                where: { registrationId },
                data: { isPrimary: false },
              });

              await this.ensureRegistrationNumber(tx, {
                stageId: importJob.stageId,
                registrationId,
                number: participantNumber,
                isPrimary: true,
              });
            }
          }

          const classIds =
            new Set<string>();

          const normalizedClasses =
            Array.isArray(
              normalized
                ?.classes,
            )
              ? normalized.classes
              : [];

          for (const item of
            normalizedClasses) {
            if (
              item?.status !==
              'MATCHED'
            ) {
              continue;
            }

            if (!item.classId) {
              continue;
            }

            classIds.add(
              item.classId,
            );
          }

          if (
            Array.isArray(
              resolution
                ?.classIds,
            )
          ) {
            for (const classId of
              resolution.classIds) {
              if (
                typeof classId ===
                  'string' &&
                classId.trim()
              ) {
                classIds.add(
                  classId,
                );
              }
            }
          }

          if (
            resolution
              ?.classId &&
            typeof resolution.classId ===
              'string'
          ) {
            classIds.add(
              resolution.classId,
            );
          }

          /*
           * Проверяем:
           * один класс на одно направление.
           */
          const usedDirections =
            new Set<string>();

          for (const classId of
            classIds) {
            const stageClass =
              await tx.stageClass.findUnique(
                {
                  where: {
                    stageId_classId:
                      {                        stageId:
                          importJob.stageId,

                        classId,
                      },
                  },
                  include: {                    class: {
                      select: {
                        id: true,
                        name: true,
                        directionId:
                          true,
                      },
                    },
                  },
                },
              );

            if (!stageClass) {
              throw new BadRequestException(
                `Класс ${classId} не подключён к этапу для строки ${row.rowNumber}`,
              );
            }

            const directionId =
              stageClass.class
                ?.directionId;

            const isBassRaceClass =
              stageClass.class?.name?.trim().toLowerCase().startsWith('bassrace') === true;

            if (
              directionId &&
              !isBassRaceClass &&
              usedDirections.has(directionId)
            ) {
              throw new BadRequestException(
                'В строке ' + row.rowNumber + ' указано несколько классов одного направления',
              );
            }

            if (directionId && !isBassRaceClass) {
              usedDirections.add(directionId);
            }

            const primaryRegistrationNumber: { id: string; number: number; registrationId: string } | null =
              await tx.registrationNumber.findFirst({
                where: {
                  registrationId,
                  isPrimary: true,
                },
              });

            if (!primaryRegistrationNumber) {
              throw new BadRequestException(
                'Для регистрации ' + registrationId + ' не найден основной номер',
              );
            }
            const classNumber: number = isBassRaceClass
              ? participantNumber
              : primaryRegistrationNumber.number;

            let classNumberRecord: { id: string; number: number; registrationId: string } | null =
              classNumber === primaryRegistrationNumber.number
                ? primaryRegistrationNumber
                : await tx.registrationNumber.findUnique({
                    where: {
                      stageId_number: {
                        stageId: importJob.stageId,
                        number: classNumber,
                      },
                    },
                  });

            if (classNumberRecord && classNumberRecord.registrationId !== registrationId) {
              if (historicalResults) {
                /*
                 * В архиве номер не должен блокировать импорт.
                 * Если он уже занят другой регистрацией, выдаём
                 * этой исторической записи следующий свободный номер.
                 * Это относится ко всем классам, а не только BassRace.
                 */
                const originalNumber = classNumber;
                const allocatedNumber = await this.allocateFreeImportNumber(
                  tx,
                  importJob.stageId,
                  originalNumber,
                );

                classNumberRecord = await tx.registrationNumber.create({
                  data: {
                    id: randomUUID(),
                    stageId: importJob.stageId,
                    registrationId,
                    number: allocatedNumber,
                    isPrimary: false,
                  },
                });
              } else {
                throw new BadRequestException(
                  'Номер участника ' + classNumber + ' уже зарезервирован другой регистрацией',
                );
              }
            }

            if (!classNumberRecord) {
              classNumberRecord = await tx.registrationNumber.create({
                data: {
                  stageId: importJob.stageId,
                  registrationId,
                  number: classNumber,
                  isPrimary: false,
                },
              });
            }


            const existingClass =
              await tx.registrationClass.findFirst({
                where: {
                  registrationId,
                  classId,
                },
              });

            if (!existingClass) {
              await tx.registrationClass.create({
                data: {
                  registrationId,
                  classId,
                  numberId: classNumberRecord.id,
                },
              });
            }
          }

          await tx.importRow.update(
            {
              where: {
                id: row.id,
              },

              data: {
                participantId,

                registrationId,

                status:
                  'COMMITTED',
              },
            },
          );

          committedRows.push({
            rowId: row.id,

            type: row.type,

            participantId,

            registrationId,
          });
        }

        /*
         * =====================================================
         * 2. RESULT
         * =====================================================
         */
        for (const row of importJob.rows) {
          if (
            row.type !==
            'RESULT'
          ) {
            continue;
          }

          if (
            row.status !==
              'READY' &&
            row.status !==
              'RESOLVED'
          ) {
            continue;
          }

          const normalized =
            row.normalizedData as any;

          const resolution =
            row.resolution as any;

          const rawData =
            row.rawData as any;

          let participantId:
            | string
            | null = null;

          let registrationId:
            | string
            | null = null;

          // Tracks whether this historical row received a fresh participant number
          // because the imported number was already occupied by another participant.
          let historicalNumberAllocated = false;

          if (
            resolution
              ?.participant
              ?.action ===
            'USE_EXISTING'
          ) {
            participantId =
              resolution
                .participant
                .participantId;
          }

          if (resolution?.participant?.action === 'CREATE_ALIAS') {
            const person = await this.createHistoricalAliasParticipant(
              tx,
              importJob.stageId,
              this.stringValue(resolution.participant.fullName),
              archivalStickerConflicts.get(row.id),
            );
            participantId = person.id;
            importedParticipants.set(
              this.normalizePersonName(this.stringValue(resolution.participant.fullName)),
              person.id,
            );
          }

          if (
            resolution?.participant?.action === 'CREATE'
          ) {
            const fullName = this.stringValue(
              resolution.participant.fullName,
            );
            const participantKey =
              this.normalizePersonName(fullName);

            /*
             * Several historical result rows can point to the same
             * participant. Reuse the participant created earlier in
             * this commit instead of creating duplicates.
             */
            participantId =
              participantKey
                ? importedParticipants.get(participantKey) ?? null
                : null;

            if (!participantId) {
              const participant =
                await this.createParticipantFromImport(
                  tx,
                  {
                    fullName,
                    team:
                      resolution.participant.team ??
                      null,
                    email:
                      resolution.participant.email ??
                      null,
                  },
                );

              participantId = participant.id;

              if (participantKey) {
                importedParticipants.set(
                  participantKey,
                  participant.id,
                );
              }
            }
          }

          /*
           * Historical preview may resolve the helper participant from
           * either the DATABASE or the Registration sheet. In both cases
           * the normalized match already contains the canonical
           * Participant id when it exists. Do not require source=DATABASE.
           */
          if (
            !participantId &&
            normalized?.participant?.matches?.length &&
            typeof normalized.participant.matches[0]?.id === 'string'
          ) {
            participantId =
              normalized.participant.matches[0].id;
          }

          const rawName =
            this.stringValue(
              normalized
                ?.participant
                ?.rawName ??
              this.getImportFieldValue(
                rawData,
                [
                  'ФИО',
                  'Фамилия и имя',
                  'participantName',
                ],
              ),
            );

          const normalizedName =
            this.normalizePersonName(
              rawName,
            );

          if (
            !participantId &&
            normalizedName
          ) {
            participantId =
              importedParticipants.get(
                normalizedName,
              ) ?? null;
          }

          if (
            resolution
              ?.registration
              ?.action ===
            'USE_EXISTING'
          ) {
            registrationId =
              resolution
                .registration
                .registrationId;
          }

          if (registrationId) {
            const existing =
              await tx.registration.findUnique(
                {
                  where: {
                    id:
                      registrationId,
                  },

                  select: {
                    id: true,

                    participantId:
                      true,

                    stageId: true,
                  },
                },
              );

            if (!existing) {
              throw new BadRequestException(
                `Регистрация ${registrationId} не найдена`,
              );
            }

            if (
              existing.stageId !==
              importJob.stageId
            ) {
              throw new BadRequestException(
                `Регистрация ${registrationId} относится к другому этапу`,
              );
            }

            if (
              participantId &&
              existing.participantId !==
                participantId
            ) {
              throw new BadRequestException(
                `Регистрация ${registrationId} принадлежит другому участнику`,
              );
            }

            if (!participantId) {
              participantId =
                existing.participantId;
            }
          }

          if (
            resolution
              ?.registration
              ?.action ===
            'CREATE'
          ) {
            let participantNumber =
              resolution
                .registration
                .participantNumber;


            let primaryParticipantNumber =
              (importJob.metadata as any)?.historicalResults === true &&
              Number.isInteger(resolution?.registration?.primaryParticipantNumber) &&
              resolution.registration.primaryParticipantNumber > 0
                ? resolution.registration.primaryParticipantNumber
                : participantNumber;
            if (
              !participantNumber ||
              participantNumber <= 0
            ) {
              throw new BadRequestException(
                `Некорректный номер участника для строки ${row.rowNumber}`,
              );
            }

            const historicalImport =
              (importJob.metadata as any)?.historicalResults === true;

            /*
             * Архив является источником истины по результатам, но один и тот же
             * напечатанный номер не должен останавливать весь импорт. Если номер
             * уже занят ДРУГИМ участником — независимо от класса — выдаём этому
             * участнику следующий свободный номер. Это особенно важно для
             * BassRace, но правило должно быть единым для всего исторического
             * импорта.
             *
             * Важно: запоминаем факт перераспределения. Ниже нельзя второй раз
             * пытаться вернуть регистрацию на исходный конфликтующий номер.
             */
            if (historicalImport) {
              const existingByImportedNumber =
                importedRegistrationsByNumber.get(participantNumber) ?? null;

              // Repeated result rows for the same person (one row per class)
              // must reuse the registration already created for that participant.
              // Comparing registrationId here is insufficient: for a CREATE
              // resolution it is normally null even when this number is already
              // mapped to the same participant.
              const mappedRegistration = existingByImportedNumber
                ? await tx.registration.findUnique({
                    where: { id: existingByImportedNumber },
                    select: { id: true, participantId: true },
                  })
                : null;

              if (
                mappedRegistration &&
                mappedRegistration.participantId === participantId
              ) {
                registrationId = mappedRegistration.id;
              }

              const existingByNumber = await tx.registration.findUnique({
                where: {
                  stageId_participantNumber: {
                    stageId: importJob.stageId,
                    participantNumber,
                  },
                },
                select: { id: true, participantId: true },
              });

              const numberBelongsToAnotherParticipant =
                Boolean(
                  existingByNumber &&
                  existingByNumber.participantId !== participantId,
                );

              const importedNumberBelongsToAnotherRegistration =
                Boolean(
                  existingByImportedNumber &&
                  existingByImportedNumber !== registrationId &&
                  mappedRegistration?.participantId !== participantId,
                );

              if (
                numberBelongsToAnotherParticipant ||
                importedNumberBelongsToAnotherRegistration
              ) {
                let allocatedNumber = normalized?.class?.isBassRace === true
                  ? await this.allocateNextHistoricalBassRaceNumber(
                      tx, importJob.stageId, historicalMaxSourceNumber,
                    )
                  : await this.allocateFreeImportNumber(
                      tx, importJob.stageId, participantNumber,
                    );

                // The in-memory map is also authoritative during this transaction:
                // never allocate a number already mapped to an imported registration,
                // even if its RegistrationNumber row has not been created yet.
                while (importedRegistrationsByNumber.has(allocatedNumber)) {
                  allocatedNumber = await this.allocateFreeImportNumber(
                    tx,
                    importJob.stageId,
                    allocatedNumber + 1,
                  );
                }

                participantNumber = allocatedNumber;
                primaryParticipantNumber = allocatedNumber;
                historicalNumberAllocated = true;
              }
            }

            if (!participantId) {
              throw new BadRequestException(
                `Не удалось определить участника для строки ${row.rowNumber}`,
              );
            }

            registrationId =
              importedRegistrationsByNumber.get(
                participantNumber,
              ) ?? null;

            if (registrationId) {
              const registration =
                await tx.registration.findUnique(
                  {
                    where: {
                      id:
                        registrationId,
                    },

                    select: {
                      participantId:
                        true,
                    },
                  },
                );

              if (
                registration &&
                registration.participantId !==
                  participantId
              ) {
                throw new BadRequestException(
                  `Строка ${row.rowNumber}: номер участника ${participantNumber} уже принадлежит другому участнику на этом этапе`,
                );
              }
            }

            if (!registrationId) {
              const existing =
                await tx.registration.findUnique(
                  {
                    where: {
                      stageId_participantNumber:
                        {
                          stageId:
                            importJob.stageId,

                          participantNumber,
                        },
                    },
                  },
                );

              if (existing) {
                if (
                  existing.participantId !==
                  participantId
                ) {
                  throw new BadRequestException(
                    `Номер участника ${participantNumber} уже принадлежит другому участнику`,
                  );
                }

                registrationId =
                  existing.id;
              }
            }

            if (!registrationId) {
              /*
               * Исторический результат может не содержать
               * автомобиль. В таком случае создаём/используем
               * технический автомобиль.
               */
              const carId =
                await this.getOrCreateImportCar(
                  tx,
                  participantId,
                  {
                    carId:
                      resolution?.car?.action === 'USE_EXISTING'
                        ? resolution.car.carId
                        : undefined,
                    brand:
                      resolution?.car?.action === 'CREATE'
                        ? resolution.car.brand
                        : undefined,
                    model:
                      resolution?.car?.action === 'CREATE'
                        ? resolution.car.model
                        : undefined,
                    registrationNumber:
                      resolution?.car?.action === 'CREATE'
                        ? resolution.car.registrationNumber
                        : undefined,
                    registrationCountry:
                      resolution?.car?.action === 'CREATE'
                        ? resolution.car.registrationCountry
                        : undefined,
                  },
                );

              const existingByCar =
                await tx.registration.findUnique(
                  {
                    where: {
                      stageId_carId: {
                        stageId:
                          importJob.stageId,
                        carId,
                      },
                    },
                  },
                );

              if (
                existingByCar
              ) {
                if (
                  existingByCar.participantId !==
                  participantId
                ) {
                  throw new BadRequestException(
                    'Автомобиль уже зарегистрирован на этом этапе за другим участником',
                  );
                }

                if (
                  existingByCar.status ===
                  'ACTIVE'
                ) {
                  registrationId =
                    existingByCar.id;
                } else {
                  registrationId =
                    existingByCar.id;

                  await tx.registration.update(
                    {
                      where: {
                        id:
                          existingByCar.id,
                      },
                      data: {
                        status:
                          'ACTIVE',
                        source:
                          'IMPORT',
                        registeredAt:
                          new Date(),
                      },
                    },
                  );
                }
              }



              if (
                historicalResults &&
                normalized?.class?.isBassRace !== true &&
                registrationId &&
                Number.isInteger(primaryParticipantNumber) &&
                primaryParticipantNumber > 0
              ) {
                const currentRegistration = await tx.registration.findUnique({
                  where: { id: registrationId },
                  select: { participantNumber: true },
                });

                if (
                  currentRegistration &&
                  currentRegistration.participantNumber !== primaryParticipantNumber
                ) {
                  const occupiedNumber = await tx.registration.findUnique({
                    where: {
                      stageId_participantNumber: {
                        stageId: importJob.stageId,
                        participantNumber: primaryParticipantNumber,
                      },
                    },
                    select: { id: true },
                  });

                  const target = await tx.registrationNumber.findUnique({
                    where: {
                      stageId_number: {
                        stageId: importJob.stageId,
                        number: primaryParticipantNumber,
                      },
                    },
                    select: { id: true, registrationId: true },
                  });

                  // RegistrationNumber has its own unique number namespace.
                  // A number can be free in Registration.participantNumber but
                  // already reserved by another registration (e.g. a class number).
                  // Never update oldPrimary onto that reserved number.
                  if (
                    (occupiedNumber && occupiedNumber.id !== registrationId) ||
                    (target && target.registrationId !== registrationId)
                  ) {
                    let allocatedNumber = await this.allocateFreeImportNumber(
                      tx,
                      importJob.stageId,
                      primaryParticipantNumber,
                    );
                    while (importedRegistrationsByNumber.has(allocatedNumber)) {
                      allocatedNumber = await this.allocateFreeImportNumber(
                        tx,
                        importJob.stageId,
                        allocatedNumber + 1,
                      );
                    }
                    primaryParticipantNumber = allocatedNumber;
                    participantNumber = allocatedNumber;
                    historicalNumberAllocated = true;
                  }

                  const oldPrimary = await tx.registrationNumber.findFirst({
                    where: { registrationId, isPrimary: true },
                  });
                  const finalTarget = await tx.registrationNumber.findUnique({
                    where: {
                      stageId_number: {
                        stageId: importJob.stageId,
                        number: primaryParticipantNumber,
                      },
                    },
                  });

                  if (finalTarget && finalTarget.registrationId === registrationId) {
                    await tx.registrationNumber.updateMany({
                      where: { registrationId },
                      data: { isPrimary: false },
                    });
                    await tx.registrationNumber.update({
                      where: { id: finalTarget.id },
                      data: { isPrimary: true },
                    });
                  } else if (oldPrimary) {
                    await tx.registrationNumber.update({
                      where: { id: oldPrimary.id },
                      data: {
                        number: primaryParticipantNumber,
                        isPrimary: true,
                      },
                    });
                  } else {
                    await this.ensureRegistrationNumber(tx, {
                      stageId: importJob.stageId,
                      registrationId,
                      number: primaryParticipantNumber,
                      isPrimary: true,
                    });
                  }

                  await tx.registration.update({
                    where: { id: registrationId },
                    data: { participantNumber: primaryParticipantNumber },
                  });
                }
              }
              if (!registrationId) {
                const registration =
                  await this.createImportRegistration(
                    tx,
                    {
                      stageId:
                        importJob.stageId,
                      participantId,
                      carId,
                      participantNumber: primaryParticipantNumber,
                      vibrationIsolation: historicalResults ? this.stringValue(normalized?.car?.vibrationIsolation) : this.stringValue(this.getImportFieldValue(rawData, ['Виброизоляция', 'vibrationIsolation'])),
                    },
                  );

                registrationId =
                  registration.id;
              }
            }

            importedRegistrationsByNumber.set(
              participantNumber,
              registrationId,
            );
          }

          if (!registrationId) {
            const resultParticipantNumber =
              normalized
                ?.participantNumber ??
              this.parseParticipantNumber(
                this.getImportFieldValue(
                  rawData,
                  [
                    'Номер',
                    'Номер участника',
                    'participantNumber',
                  ],
                ),
              );

            if (
              typeof resultParticipantNumber ===
                'number' &&
              resultParticipantNumber >
                0
            ) {
              registrationId =
                importedRegistrationsByNumber.get(
                  resultParticipantNumber,
                ) ?? null;
              if (!registrationId) {
                const existing =
                  await tx.registration.findUnique(
                    {
                      where: {
                        stageId_participantNumber:
                          {
                            stageId:                              importJob.stageId,

                            participantNumber:
                              resultParticipantNumber,
                          },
                      },
                    },
                  );

                if (existing) {
                  if (
                    participantId &&
                    existing.participantId !==
                      participantId
                  ) {
                    throw new BadRequestException(
                      `Номер участника ${resultParticipantNumber} принадлежит другому участнику`,
                    );
                  }

                  registrationId =
                    existing.id;

                  if (!participantId) {
                    participantId =
                      existing.participantId;
                  }
                }
              }
            }
          }

          if (
            !registrationId &&
            normalizedName
          ) {
            registrationId =
              importedRegistrations.get(
                normalizedName,
              ) ?? null;
          }

          if (
            !registrationId &&
            participantId
          ) {
            const existing =
              await tx.registration.findFirst(
                {
                  where: {
                    stageId:
                      importJob.stageId,

                    participantId,

                    status:
                      'ACTIVE',
                  },

                  orderBy: {
                    participantNumber:
                      'asc',
                  },
                },
              );

            if (existing) {
              registrationId =
                existing.id;
            }
          }

          if (
            !participantId &&
            registrationId
          ) {
            const registration =
              await tx.registration.findUnique(
                {
                  where: {
                    id:
                      registrationId,
                  },

                  select: {
                    participantId:
                      true,
                  },
                },
              );

            if (registration) {
              participantId =
                registration.participantId;
            }
          }

          if (!participantId) {
            throw new BadRequestException(
              `Не удалось определить участника для результата, строка ${row.rowNumber}`,
            );
          }

          if (!registrationId) {
            throw new BadRequestException(
              `Не удалось определить регистрацию для результата, строка ${row.rowNumber}`,
            );
          }

          const classId =
            resolution
              ?.classId ??
            normalized
              ?.class
              ?.classId ??
            row.classId;

          if (!classId) {
            throw new BadRequestException(
              `Не удалось определить класс для строки ${row.rowNumber}`,
            );
          }

          const stageClass =
            await tx.stageClass.findUnique(
              {
                where: {
                  stageId_classId:
                    {
                      stageId:
                        importJob.stageId,

                      classId,
                    },
                },
                include: {
                  class: {
                    select: {
                      id: true,
                      name: true,
                      unit: true,
                    },
                  },
                },
              },
            );

          if (!stageClass) {
            throw new BadRequestException(
              `Класс ${classId} не подключён к этапу для строки ${row.rowNumber}`,
            );
          }

          const registrationContext = await tx.registration.findUnique({
            where: { id: registrationId },
            select: { participantNumber: true },
          });

          if (!registrationContext) {
            throw new BadRequestException(
              'Регистрация не найдена для строки результата ' + row.rowNumber,
            );
          }

          let historicalOrResolvedNumber =
            resolution?.participantNumber ??
            normalized?.participantNumber ??
            this.parseParticipantNumber(
              this.getImportFieldValue(rawData, [
                'Номер',
                'Номер участника',
                'participantNumber',
              ]),
            );

          const isBassRace = stageClass.class.name.trim().toLowerCase().startsWith('bassrace');

          let primaryNumber = registrationContext.participantNumber;

          /*
           * Historical Results is the source of truth for ordinary classes.
           * If the result contains a real number, that number becomes the
           * registration's primary number. It must never be represented as
           * an "additional" number for a normal class.
           *
           * BassRace is the only exception: each appearance may keep its own
           * reserved number on the same registration.
           */
          if (
            historicalResults &&
            !isBassRace &&
            !historicalNumberAllocated &&
            historicalOrResolvedNumber &&
            historicalOrResolvedNumber > 0
          ) {
            // В исторических результатах исходные номера могут конфликтовать
            // с регистрациями/резервами, созданными ранее в этом же импорте.
            // Не останавливаем весь импорт: назначаем этой регистрации свободный номер.
            let occupied = await tx.registration.findUnique({
              where: {
                stageId_participantNumber: {
                  stageId: importJob.stageId,
                  participantNumber: historicalOrResolvedNumber,
                },
              },
              select: { id: true },
            });

            let existingNumber = await tx.registrationNumber.findUnique({
              where: {
                stageId_number: {
                  stageId: importJob.stageId,
                  number: historicalOrResolvedNumber,
                },
              },
            });

            if (
              (occupied && occupied.id !== registrationId) ||
              (existingNumber && existingNumber.registrationId !== registrationId)
            ) {
              let allocatedNumber = await this.allocateFreeImportNumber(
                tx,
                importJob.stageId,
                historicalOrResolvedNumber + 1,
              );

              // Проверяем обе таблицы: старые данные могут содержать номер
              // регистрации без соответствующей записи в RegistrationNumber.
              while (true) {
                occupied = await tx.registration.findUnique({
                  where: {
                    stageId_participantNumber: {
                      stageId: importJob.stageId,
                      participantNumber: allocatedNumber,
                    },
                  },
                  select: { id: true },
                });
                existingNumber = await tx.registrationNumber.findUnique({
                  where: {
                    stageId_number: {
                      stageId: importJob.stageId,
                      number: allocatedNumber,
                    },
                  },
                });
                if (
                  (!occupied || occupied.id === registrationId) &&
                  (!existingNumber || existingNumber.registrationId === registrationId)
                ) break;
                allocatedNumber = await this.allocateFreeImportNumber(
                  tx,
                  importJob.stageId,
                  allocatedNumber + 1,
                );
              }

              historicalOrResolvedNumber = allocatedNumber;
            }

            const oldPrimary = await tx.registrationNumber.findFirst({
              where: { registrationId, isPrimary: true },
            });

            if (existingNumber) {
              await tx.registrationNumber.updateMany({
                where: { registrationId },
                data: { isPrimary: false },
              });
              await tx.registrationNumber.update({
                where: { id: existingNumber.id },
                data: { isPrimary: true },
              });
            } else if (oldPrimary) {
              await tx.registrationNumber.update({
                where: { id: oldPrimary.id },
                data: { number: historicalOrResolvedNumber, isPrimary: true },
              });
            } else {
              await this.ensureRegistrationNumber(tx, {
                stageId: importJob.stageId,
                registrationId,
                number: historicalOrResolvedNumber,
                isPrimary: true,
              });
            }

            await tx.registration.update({
              where: { id: registrationId },
              data: { participantNumber: historicalOrResolvedNumber },
            });

            primaryNumber = historicalOrResolvedNumber;
          }

          let classNumber =
            isBassRace && historicalOrResolvedNumber && historicalOrResolvedNumber > 0 && !historicalNumberAllocated
              ? historicalOrResolvedNumber
              : primaryNumber;

          if (historicalResults && isBassRace && classNumber > 0) {
            classNumber = await this.resolveHistoricalBassRaceClassNumber(
              tx, importJob.stageId, registrationId, classId,
              classNumber, historicalMaxSourceNumber,
            );
          }

          // Final guard: class-number reservations have their own unique namespace.
          // In historical imports, a stale reservation must not abort the whole import.
          if (historicalResults && !isBassRace && classNumber > 0) {
            const reservedClassNumber = await tx.registrationNumber.findUnique({
              where: {
                stageId_number: {
                  stageId: importJob.stageId,
                  number: classNumber,
                },
              },
              select: { registrationId: true },
            });

            if (
              reservedClassNumber &&
              reservedClassNumber.registrationId !== registrationId
            ) {
              classNumber = await this.allocateFreeImportNumber(
                tx,
                importJob.stageId,
                classNumber + 1,
              );

              while (importedRegistrationsByNumber.has(classNumber)) {
                classNumber = await this.allocateFreeImportNumber(
                  tx,
                  importJob.stageId,
                  classNumber + 1,
                );
              }

              // Keep the registration's primary number and the class reservation aligned.
              await tx.registration.update({
                where: { id: registrationId },
                data: { participantNumber: classNumber },
              });
              await tx.registrationNumber.updateMany({
                where: { registrationId },
                data: { isPrimary: false },
              });
            }
          }

          const registrationNumber = await this.ensureRegistrationNumber(tx, {
            stageId: importJob.stageId,
            registrationId,
            number: classNumber,
            isPrimary: !isBassRace,
          });

          let registrationClass =
            await tx.registrationClass.findFirst({
              where: {
                registrationId,
                classId,
              },
            });

          if (!registrationClass) {
            registrationClass = await tx.registrationClass.create({
              data: {
                registrationId,
                classId,
                numberId: registrationNumber.id,
              },
            });
          } else if (registrationClass.numberId !== registrationNumber.id) {
            registrationClass = await tx.registrationClass.update({
              where: { id: registrationClass.id },
              data: { numberId: registrationNumber.id },
            });
          }

          const value =
            resolution?.value ??
            row.value ??
            normalized
              ?.result;

          const unit =
            stageClass.class.unit;

          const place =
            resolution?.place ??
            row.place ??
            normalized?.place ??
            null;

          const notes =
            resolution?.notes !== undefined
              ? resolution.notes?.trim() || null
              : null;
          if (
            value === null ||
            value === undefined
          ) {
            throw new BadRequestException(
              `Не указан результат для строки ${row.rowNumber}`,
            );
          }

          const existingResult =
            await tx.result.findFirst(
              {
                where: {
                  registrationClassId:
                    registrationClass.id,
                },
                select: {
                  id: true,
                  value: true,
                  place: true,
                  unit: true,
                },
              },
            );

          let resultId: string;

          const importedValueNumber = Number(value);
          const existingValueNumber = existingResult ? Number(existingResult.value) : null;
          const sameExistingResult = Boolean(
            existingResult &&
            Number.isFinite(importedValueNumber) &&
            Number.isFinite(existingValueNumber) &&
            Math.abs(importedValueNumber - existingValueNumber!) < 0.0005 &&
            (place ?? null) === (existingResult.place ?? null) &&
            existingResult.unit === unit,
          );

          if (existingResult) {
            const existingAction = String(resolution?.existingResultAction ?? '').toUpperCase();
            if (existingAction === 'KEEP_EXISTING') {
              resultId = existingResult.id;
            } else if (existingAction === 'REPLACE') {
              const replaced = await tx.result.update({
                where: { id: existingResult.id },
                data: { value, unit, place, notes },
              });
              resultId = replaced.id;
            } else {
              throw new BadRequestException(
                `Строка ${row.rowNumber}: результат уже существует. Выберите «Оставить существующий» или «Заменить».`,
              );
            }
          } else {
            const result = await tx.result.create({
              data: {
                registrationId,
                registrationClassId: registrationClass.id,
                value,
                unit: stageClass.class.unit,
                place,
                notes,
                isBest: false,
                isHistorical: historicalResults,
                verificationStatus: historicalResults ? 'PENDING' : 'NOT_REQUIRED',
              },
            });

            resultId = result.id;

            if (historicalResults) {
              const existingInspection = await tx.inspection.findUnique({
                where: { registrationId },
                select: { id: true },
              });

              if (!existingInspection) {
                await tx.inspection.create({
                  data: {
                    registrationId,
                    status: 'PASSED',
                    checkedByUserId: request?.user.sub ?? null,
                    createdByUserId: request?.user.sub ?? null,
                    checkedByName: 'Исторический импорт',
                    notes: 'Автоматически пройдено при историческом импорте',
                  },
                });
              }
            }
          }

          await tx.importRow.update(
            {
              where: {
                id: row.id,
              },

              data: {
                participantId,

                registrationId,

                classId,

                status:
                  'COMMITTED',
              },
            },
          );

          committedRows.push({
            rowId: row.id,

            type: row.type,

            participantId,

            registrationId,

            classId,

            resultId,
          });
        }

        if (historicalResults && committedRows.some((row) => row.type === 'RESULT')) {
          await tx.stage.update({
            where: { id: importJob.stageId },
            data: { resultsPublishedAt: new Date(), status: 'PUBLISHED', registrationOpen: false },
          });
        }

        await tx.importJob.update(
          {
            where: {
              id: importId,
            },

            data: {
              status: finalStatus,
            },
          },
        );

        if (request) {
          await tx.auditLog.create({
            data: {
              userId: request.user.sub,
              action: 'IMPORT_COMMITTED',
              entity: 'ImportJob',
              entityId: importId,
              ipAddress: request.ip,
              metadata: {
                stageId: importJob.stageId,
                rowsCount: committedRows.length,
                historicalResults:
                  (importJob.metadata as any)?.historicalResults === true,
              },
            },
          });
        }

        return {
          success: true,

          importJobId:
            importId,

          status: finalStatus,
          pendingResults,

          historicalResults:
            (importJob.metadata as any)?.historicalResults === true,

          rows:
            committedRows,
        };
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
  }

  async checkImport(
    importJobId: string,
  ) {
    const rows =
      await this.prisma.importRow.findMany(
        {
          where: {
            importJobId,

            status:
              'COMMITTED',
          },

          orderBy: {
            rowNumber:
              'asc',
          },
        },
      );

    const participantIds = [
      ...new Set(
        rows
          .map(
            (row) =>
              row.participantId,
          )
          .filter(
            (
              id,
            ): id is string =>
              Boolean(id),
          ),
      ),
    ];

    const registrationIds = [
      ...new Set(
        rows
          .map(
            (row) =>
              row.registrationId,
          )
          .filter(
            (
              id,
            ): id is string =>
              Boolean(id),
          ),
      ),
    ];

    const participants =
      await this.prisma.participant.findMany(
        {
          where: {
            id: {
              in: participantIds,
            },
          },

          select: {
            id: true,

            lastName: true,

            firstName: true,

            middleName: true,

            team: true,

            city: true,

            photoUrl: true,
          },
        },
      );

    const registrations =
      await this.prisma.registration.findMany(
        {
          where: {
            id: {
              in: registrationIds,
            },
          },

          select: {
            id: true,

            participantId:
              true,

            stageId: true,

            carId: true,

            participantNumber:
              true,

            source: true,

            status: true,

            registeredAt:
              true,

            classes: {
              select: {
                classId:
                  true,
              },
            },

            car: {
              select: {
                id: true,

                brand: true,

                model: true,

                registrationNumber:
                  true,

                registrationCountry:
                  true,

                color: true,

                isActive: true,

                isPublic: true,
              },
            },
          },
        },
      );

    const results =
      await this.prisma.result.findMany(
        {
          where: {
            registrationId: {
              in: registrationIds,
            },
          },

          select: {
            id: true,

            registrationId:
              true,

            registrationClassId:
              true,

            value: true,

            unit: true,

            place: true,

            isBest: true,
          },
        },
      );

    const records =
      await this.prisma.record.findMany(
        {
          where: {
            result: {
              registrationId: {
                in: registrationIds,
              },
            },
          },

          select: {
            id: true,

            resultId:              true,
          },
        },
      );

    return {
      success: true,

      importJobId,

      rows:
        rows.length,

      participants,

      registrations,

      results,

      records,    };
  }

  private parseParticipantNumber(
    value: unknown,
  ): number | null {
    if (
      value === null ||
      value === undefined ||
      String(value).trim() === ''
    ) {
      return null;
    }

    const normalized =
      String(value)
        .trim()
        .replace(
          /\s+/g,
          '',
        );

    const number =
      Number(normalized);

    if (
      !Number.isInteger(
        number,
      ) ||
      number <= 0
    ) {
      return null;
    }

    return number;
  }
}