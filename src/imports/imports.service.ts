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
  };
};

type RegistrationParticipantIndex = {
  byName: Map<string, RegistrationParticipantMatch[]>;
  byNumber: Map<number, RegistrationParticipantMatch[]>;
};

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nameNormalizer: NameNormalizerService,
  ) {}

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
      this.buildRegistrationParticipantIndex(
        registrations,
      );

    const registrationPreview =
      await Promise.all(
        registrations.map(
          (row, index) =>
            this.previewRegistrationRow(
              row,
              index + 1,
              participantMatches,
              stageClasses,
              body.stageId,
            ),
        ),
      );

    const resultPreview = results.map(
      (row, index) =>
        this.previewResultRow(
          row,
          index + 1,
          participantMatches,
          registrationParticipants,
          stageClasses,
        ),
    );

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
                    'Номер автомобиля',
                    'Гос. номер',
                    'Гос номер',
                    'Регистрационный номер',
                    'registrationNumber',
                    'plateNumber',
                  ],
                ),
              ),
          },
        };

        if (normalizedName) {
          const existingByName =
            byName.get(
              normalizedName,
            ) ?? [];

          existingByName.push(
            registrationParticipant,
          );

          byName.set(
            normalizedName,
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
    };
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

    if (matches.length === 0) {
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

  private findRegistrationParticipant(
    rawName: string,
    registrationIndex: RegistrationParticipantIndex,
    participantNumber?: number | null,
  ) {
    if (
      participantNumber !== null &&
      participantNumber !== undefined &&
      participantNumber > 0
    ) {
      const numberMatches =
        registrationIndex.byNumber.get(
          participantNumber,
        ) ?? [];

      if (numberMatches.length === 1) {
        return {
          status: 'MATCHED' as const,

          normalizedName:
            numberMatches[0].normalizedName,

          matches: numberMatches,

          matchType: 'NUMBER' as const,
        };
      }

      if (numberMatches.length > 1) {
        return {
          status: 'AMBIGUOUS' as const,

          normalizedName:
            this.normalizePersonName(
              rawName,
            ),

          matches: numberMatches,

          matchType: 'NUMBER' as const,
        };
      }
    }

    const normalizedName =
      this.normalizePersonName(
        rawName,
      );

    const matches =
      registrationIndex.byName.get(
        normalizedName,
      ) ?? [];

    if (matches.length === 0) {
      return {
        status: 'NOT_FOUND' as const,

        normalizedName,

        matches: [],

        matchType: 'NAME' as const,
      };
    }

    if (matches.length === 1) {
      return {
        status: 'MATCHED' as const,

        normalizedName,

        matches,

        matchType: 'NAME' as const,
      };
    }

    return {
      status: 'AMBIGUOUS' as const,

      normalizedName,

      matches,

      matchType: 'NAME' as const,
    };
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
        direction: 'BDWSPL',
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
        car =
          await this.prisma.car.findFirst({
            where: {
              participantId,
              registrationNumber:
                rawPlate,
            },
            orderBy: {
              createdAt: 'asc',
            },
          });
      }

      if (!car && rawModel) {
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

        if (
          matchedParticipantId &&
          existingByNumber.participantId !==
          matchedParticipantId
        ) {
          warnings.push(
            `Строка ${rowNumber}: номер участника ${participantNumber} уже принадлежит другому участнику на этом этапе`,
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

  private previewResultRow(
    row: ImportRow,
    rowNumber: number,
    participantIndex: Map<
      string,
      ParticipantIndexItem[]
    >,
    registrationParticipantIndex: RegistrationParticipantIndex,
    stageClasses: Array<any>,
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
      this.findParticipant(
        rawName,
        participantIndex,
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
      | 'NONE' = 'NONE';

    const warnings: string[] = [];

    if (
      registrationParticipant.status ===
      'MATCHED'
    ) {
      if (
        registrationParticipantNumber !==
        null
      ) {
        participantNumber =
          registrationParticipantNumber;

        if (
          resultParticipantNumber !==
          null
        ) {
          if (
            resultParticipantNumber ===
            registrationParticipantNumber
          ) {
            participantNumberSource =
              'BOTH';
          } else {
            participantNumberSource =
              'REGISTRATION';

            warnings.push(
              `Строка ${rowNumber}: номер участника в результате (${resultParticipantNumber}) отличается от номера в регистрации (${registrationParticipantNumber})`,
            );
          }
        } else {
          participantNumberSource =
            'REGISTRATION';
        }
      } else if (
        resultParticipantNumber !==
        null
      ) {
        participantNumber =
          resultParticipantNumber;

        participantNumberSource =
          'RESULT';

        warnings.push(
          `Строка ${rowNumber}: у участника есть регистрация этапа, но номер в регистрации отсутствует; используется номер из результата`,
        );
      } else {
        warnings.push(
          `Строка ${rowNumber}: номер участника отсутствует и в результате, и в регистрации этапа`,
        );
      }
    } else if (
      registrationParticipant.status ===
      'AMBIGUOUS'
    ) {
      if (
        resultParticipantNumber !==
        null
      ) {
        participantNumber =
          resultParticipantNumber;

        participantNumberSource =
          'RESULT';

        warnings.push(
          `Строка ${rowNumber}: найдено несколько регистраций с ФИО "${rawName}", используется номер из результата`,
        );
      } else {
        warnings.push(
          `Строка ${rowNumber}: найдено несколько регистраций с ФИО "${rawName}", определить номер автоматически нельзя`,
        );
      }
    } else {
      if (
        resultParticipantNumber !==
        null
      ) {
        participantNumber =
          resultParticipantNumber;

        participantNumberSource =
          'RESULT';
      }

      warnings.push(
        `Строка ${rowNumber}: участник "${rawName}" отсутствует в регистрации этого этапа`,
      );
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
        `Строка ${rowNumber}: найдено несколько участников с ФИО "${rawName}" в базе`,
      );
    }

    if (
      participant.status ===
      'NEW'
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

    const isBassRace =
      className
        .toLowerCase()
        .startsWith(
          'bassrace',
        );

    if (
      resultValue === 0 &&
      !isBassRace
    ) {
      warnings.push(
        `Строка ${rowNumber}: результат равен 0 и требует ручной проверки`,
      );
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
    };

    return (
      aliases[normalized] ??
      normalized
    );
  }

  private normalizeClassName(
    value: string,
  ): string {
    return value
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
    return String(value ?? '')
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

  private async createParticipantFromImport(
    tx: any,
    participant: {
      fullName?: string;
      team?: string | null;
      email?: string | null;
    },
  ) {
    const fullName =
      this.stringValue(
        participant.fullName,
      );

    const parsedName =
      this.splitFullName(
        fullName,
      );

    const createdParticipant =
      await tx.participant.create({
        data: {
          lastName:
            parsedName.lastName,

          firstName:
            parsedName.firstName,

          middleName:
            parsedName.middleName,

          team:
            participant.team ??
            null,
        },
      });

    const email =
      this.stringValue(
        participant.email,
      );

    if (email) {
      await tx.participantLegacyEmail.create({
        data: {
          participantId:
            createdParticipant.id,

          email,
        },
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

  async resolveImportRow(
    importId: string,
    rowId: string,
    resolution: {
      participant?: {
        action:
          | 'USE_EXISTING'
          | 'CREATE';

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
      };

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

    if (
      row.status !==
      'WARNING'
    ) {
      throw new BadRequestException(
        `Строка ${rowId} не находится в статусе WARNING`,
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
      if (action !== 'USE_EXISTING' && action !== 'CREATE') {
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
        action === 'CREATE' &&
        (!resolution.participant.fullName ||
          typeof resolution.participant.fullName !== 'string' ||
          !resolution.participant.fullName.trim())
      ) {
        throw new BadRequestException(
          'Для CREATE необходимо указать непустое ФИО участника',
        );
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
          !resolution.car.model?.trim() ||
          !resolution.car.registrationNumber?.trim())
      ) {
        throw new BadRequestException(
          'Для CREATE автомобиля необходимо указать марку, модель и регистрационный номер',
        );
      }
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

    const updatedRow =
      await this.prisma.importRow.update({
        where: {
          id: row.id,
        },

        data: {
          resolution:
            this.toJson(
              resolution,
            ),

          status: 'RESOLVED',
        },
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
      const existingByPlate =
        await tx.car.findFirst({
          where: {
            participantId,
            registrationNumber:
              plateNumber,
          },
        });

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

    if (model) {
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
            brand: 'Импорт',
            model:
              'Автомобиль из старого импорта',
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
            brand || 'Импорт',
          model:
            model ||
            'Автомобиль из импорта',
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
  ) {
    const name = 'LEGACY_IMPORT';

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

    let version = await tx.carConfigurationVersion.findFirst({
      where: {
        configurationId: configuration.id,
        version: configuration.currentVersion,
      },
    });

    if (!version) {
      version = await tx.carConfigurationVersion.create({
        data: {
          configurationId: configuration.id,
          version: configuration.currentVersion,
          additionalDescription:
            'LEGACY_IMPORT: точная конфигурация автомобиля в историческом импорте отсутствовала.',
        },
      });
    }

    return {
      configuration,
      version,
    };
  }

  private async createImportRegistration(
    tx: Prisma.TransactionClient,
    data: {
      stageId: string;
      participantId: string;
      carId: string;
      participantNumber: number;
    },
  ) {
    const { configuration, version } =
      await this.ensureLegacyImportConfiguration(
        tx,
        data.carId,
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
      return await tx.registration.create({
        data: {
          stageId: data.stageId,
          participantId: data.participantId,
          carId: data.carId,
          configurationVersionId: version.id,
          configurationSnapshot,
          participantNumber: data.participantNumber,
          source: 'IMPORT',
          status: 'ACTIVE',
        },
      });
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
      } else if (resolution.participant?.action === 'CREATE') {
        if (
          typeof resolution.participant.fullName !== 'string' ||
          !resolution.participant.fullName.trim()
        ) {
          throw new BadRequestException(
            `Строка ${row.rowNumber}: для нового участника не указано ФИО`,
          );
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
          !resolution.car.model.trim() ||
          typeof resolution.car.registrationNumber !== 'string' ||
          !resolution.car.registrationNumber.trim()
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
  ) {
    return this.prisma.$transaction(
      async (tx) => {
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

        if (
          importJob.status !==
          'DRAFT'
        ) {
          throw new BadRequestException(
            `Импорт ${importId} нельзя выполнить: статус ${importJob.status}`,
          );
        }

        const unresolvedRows =
          importJob.rows.filter(
            (row) =>
              row.status ===
              'WARNING',
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
          importJob.rows.filter(
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
          importJob.rows.filter(
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
          importJob,
        );


        /*
         * Блокируем этап на время Commit.
         *
         * Это защищает от двух одновременных импортов,
         * которые пытаются выдать один и тот же номер
         * или зарегистрировать один автомобиль.
         */
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(
            hashtext(${importJob.stageId})
          )
        `;

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

              if (
                existingRegistrationByCar.status ===
                'ACTIVE'
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

            if (
              directionId &&
              usedDirections.has(
                directionId,
              )
            ) {
              throw new BadRequestException(
                `В строке ${row.rowNumber} указано несколько классов одного направления`,
              );
            }

            if (directionId) {
              usedDirections.add(
                directionId,
              );
            }

            const existingClass =
              await tx.registrationClass.findFirst(
                {
                  where: {
                    registrationId,

                    classId,
                  },
                },
              );

            if (
              !existingClass
            ) {
              await tx.registrationClass.create(
                {
                  data: {
                    registrationId,

                    classId,
                  },
                },
              );
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
                },
              );

            participantId =
              participant.id;
          }

          if (
            !participantId &&
            normalized
              ?.participant
              ?.source ===
              'DATABASE' &&
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
            const participantNumber =
              resolution
                .registration
                .participantNumber;

            if (
              !participantNumber ||
              participantNumber <= 0
            ) {
              throw new BadRequestException(
                `Некорректный номер участника для строки ${row.rowNumber}`,
              );
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
                  `Номер участника ${participantNumber} уже принадлежит другому участнику`,
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

          let registrationClass =
            await tx.registrationClass.findFirst(
              {
                where: {
                  registrationId,

                  classId,
                },
              },
            );

          if (
            !registrationClass
          ) {
            registrationClass =
              await tx.registrationClass.create(
                {
                  data: {
                    registrationId,

                    classId,
                  },
                },
              );
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

          const historicalResults =
            (importJob.metadata as any)?.historicalResults === true;

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
                },
              },
            );

          let resultId: string;

          if (existingResult) {
            resultId =
              existingResult.id;
          } else {
            const result =
              await tx.result.create({
                data: {
                  registrationId,

                  registrationClassId:
                    registrationClass.id,

                  value,

                  unit:
                    stageClass.class.unit,

                  place,

                  notes,

                  isBest:
                    false,

                  isHistorical:
                    historicalResults,

                  verificationStatus:
                    historicalResults
                      ? 'PENDING'
                      : 'NOT_REQUIRED',
                },
              });

            resultId =
              result.id;
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

        await tx.importJob.update(
          {
            where: {
              id: importId,
            },

            data: {
              status:
                'COMMITTED',
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

          status:
            'COMMITTED',

          historicalResults:
            (importJob.metadata as any)?.historicalResults === true,

          rows:
            committedRows,
        };
      },
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