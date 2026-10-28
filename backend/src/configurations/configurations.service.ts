import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';

import {
  CreateBatteryDto,
  CreateConfigurationDto,
  CreateGeneratorDto,
  CreateHeadUnitDto,
} from './dto/create-configuration.dto';

import { UpdateConfigurationDto } from './dto/update-configuration.dto';
import { assertCatalogEquipment } from './catalog-validation';

@Injectable()
export class ConfigurationsService {
  constructor(private readonly prisma: PrismaService) {}

  private async validateCatalogVersion(tx: Prisma.TransactionClient, dto: CreateConfigurationDto, previousVersionId?: string) {
    const [settings, previous] = await Promise.all([
      tx.siteSettings.findUnique({ where: { id: 'default' }, select: { catalogs: true } }),
      previousVersionId ? tx.carConfigurationVersion.findUnique({
        where: { id: previousVersionId },
        include: { headUnits: true, audioComponents: true, amplifiers: true },
      }) : Promise.resolve(null),
    ]);
    assertCatalogEquipment(settings?.catalogs, dto, {
      headUnits: previous?.headUnits ?? [],
      audioComponents: previous?.audioComponents ?? [],
      amplifiers: previous?.amplifiers ?? [],
    });
  }

  // A final correction is separate from the original registration snapshot.
  private final2026Where(userId: string): Prisma.RegistrationWhereInput {
    return {
      source: 'IMPORT', status: { not: 'CANCELLED' },
      participant: { user: { id: userId } },
      car: { participant: { user: { id: userId } } },
      stage: { season: { year: 2026 }, stageNumber: 12, isDeleted: false,
        date: { gte: new Date('2026-09-12T00:00:00Z'), lt: new Date('2026-09-13T00:00:00Z') } },
      results: { some: { isHistorical: true } },
      configurationSnapshot: { path: ['legacyImport'], equals: true },
    };
  }

  async final2026Configurations(request: any) {
    if (!request.user?.sub) throw new ForbiddenException('Authenticated user is missing');
    const rows = await this.prisma.registration.findMany({
      where: this.final2026Where(request.user.sub),
      orderBy: { id: 'asc' },
      include: { car: true, stage: true, configurationConfirmation: true,
        configurationVersion: { include: { configuration: true, headUnits: true, audioComponents: true,
          amplifiers: { include: { componentLinks: true } }, batteries: true, generators: true } } },
    });
    return { items: rows.map(row => ({
      registrationId: row.id, car: { id: row.car.id, brand: row.car.brand, model: row.car.model, registrationNumber: row.car.registrationNumber },
      stageName: row.stage.name, stageDate: row.stage.date,
      confirmedAt: row.configurationConfirmation?.confirmedAt ?? null,
      configuration: { id: row.configurationVersion.configurationId, name: 'Финал 2026',
        currentVersion: row.configurationVersion.version, versions: [row.configurationVersion] },
    })) };
  }

  async confirmFinal2026Configuration(request: any, registrationId: string, dto: CreateConfigurationDto) {
    if (!request.user?.sub) throw new ForbiddenException('Authenticated user is missing');
    return this.prisma.$transaction(async tx => {
      const registration = await tx.registration.findFirst({
        where: { ...this.final2026Where(request.user.sub), id: registrationId },
        include: { configurationVersion: true, configurationConfirmation: true },
      });
      if (!registration) throw new NotFoundException('Историческая конфигурация финала 2026 не найдена');
      // Repeated submissions (including network retries) never create a duplicate.
      if (registration.configurationConfirmation) return registration.configurationConfirmation;
      const configurationId = registration.configurationVersion.configurationId;
      await this.validateCatalogVersion(tx, dto, registration.configurationVersion.id);
      const current = await tx.carConfiguration.findUniqueOrThrow({ where: { id: configurationId } });
      const version = await tx.carConfigurationVersion.create({ data: {
        configurationId, version: current.currentVersion + 1,
        vibrationIsolation: dto.vibrationIsolation, additionalDescription: dto.additionalDescription,
      } });
      await this.createVersionChildren(tx, version.id, dto);
      await tx.carConfiguration.update({ where: { id: configurationId }, data: { currentVersion: version.version } });
      return tx.historicalConfigurationConfirmation.create({ data: {
        registrationId, versionId: version.id, confirmedByUserId: request.user.sub,
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  // =========================================================
  // Helpers
  // =========================================================

  private async requireCarAccess(
    request: any,
    carId: string,
  ) {
    const car = await this.prisma.car.findUnique({
      where: {
        id: carId,
      },
      select: {
        id: true,
        participantId: true,
      },
    });

    if (!car) {
      throw new NotFoundException('Car not found');
    }

    const user = request.user;

    if (user?.role === 'ADMIN') {
      return car;
    }

    const userId = user?.sub;

    if (!userId) {
      throw new ForbiddenException(
        'Authenticated user is missing',
      );
    }

    const participant =
      await this.prisma.participant.findFirst({
        where: {
          id: car.participantId,
          user: {
            id: userId,
          },
        },
        select: {
          id: true,
        },
      });

    if (!participant) {
      throw new ForbiddenException(
        'You do not have access to this car',
      );
    }

    return car;
  }

  private async getConfigurationOrThrow(
    configurationId: string,
  ) {
    const configuration =
      await this.prisma.carConfiguration.findUnique({
        where: {
          id: configurationId,
        },
        include: {
          car: {
            select: {
              id: true,
            },
          },
        },
      });

    if (!configuration) {
      throw new NotFoundException(
        'Configuration not found',
      );
    }

    return configuration;
  }

  private async requireConfigurationReadAccess(
    request: any,
    configurationId: string,
  ) {
    const configuration =
      await this.getConfigurationOrThrow(configurationId);

    if (!request.personalAccountAccess && (request.user?.role === 'ADMIN' || Boolean(request.user?.customRoleId))) {
      return configuration;
    }

    await this.requireCarAccess(request, configuration.carId);
    return configuration;
  }

  private async requireConfigurationAccess(
    request: any,
    configurationId: string,
  ) {
    const configuration =
      await this.getConfigurationOrThrow(configurationId);

    await this.requireCarAccess(request, configuration.carId);
    return configuration;
  }

  private async validateComponentLinks(
    versionId: string,
    amplifiers: {
      componentLinks: {
        componentId: string;
        quantity: number;
      }[];
    }[],
  ) {
    const componentIds = [
      ...new Set(
        amplifiers.flatMap((amplifier) =>
          amplifier.componentLinks.map(
            (link) => link.componentId,
          ),
        ),
      ),
    ];

    if (componentIds.length === 0) {
      return;
    }

    const components =
      await this.prisma.carAudioComponent.findMany({
        where: {
          id: {
            in: componentIds,
          },
          versionId,
        },
        select: {
          id: true,
          quantity: true,
        },
      });

    const componentMap = new Map(
      components.map((component) => [
        component.id,
        component,
      ]),
    );

    for (const amplifier of amplifiers) {
      for (const link of amplifier.componentLinks) {
        const component = componentMap.get(
          link.componentId,
        );

        if (!component) {
          throw new BadRequestException(
            `Audio component ${link.componentId} does not belong to this configuration version`,
          );
        }

        if (
          link.quantity >
          component.quantity
        ) {
          throw new BadRequestException(
            `Amplifier link quantity for component ${link.componentId} cannot exceed installed component quantity`,
          );
        }
      }
    }
  }

  // =========================================================
  // GET /cars/:carId/configurations
  // =========================================================

  async findByCar(
    request: any,
    carId: string,
  ) {
    if (request.personalAccountAccess || (request.user?.role !== 'ADMIN' && !request.user?.customRoleId)) {
      await this.requireCarAccess(request, carId);
    }

    return this.prisma.carConfiguration.findMany({
      where: {
        carId,
        isActive: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        versions: {
          orderBy: {
            version: 'desc',
          },
          take: 1,
          include: {
            historicalConfirmations: { select: { confirmedAt: true, registrationId: true } },
            headUnits: true,
            audioComponents: true,
            amplifiers: {
              include: {
                componentLinks: {
                  select: {
                    amplifierId: true,
                    componentId: true,
                    quantity: true,
                  },
                },
              },
            },
            batteries: true,
            generators: true,
          },
        },
      },
    });
  }

  // =========================================================
  // GET /configurations/:configurationId
  // =========================================================

  async findOne(
    request: any,
    configurationId: string,
  ) {
    const configuration =
      await this.requireConfigurationReadAccess(
        request,
        configurationId,
      );

    return this.prisma.carConfiguration.findUnique({
      where: {
        id: configuration.id,
      },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          include: {
            historicalConfirmations: { select: { confirmedAt: true, registrationId: true } },
            headUnits: true,
            audioComponents: true,
            amplifiers: {
              include: {
                componentLinks: {
                  select: {
                    amplifierId: true,
                    componentId: true,
                    quantity: true,
                  },
                },
              },
            },
            batteries: true,
            generators: true,
          },
        },
      },
    });
  }

  // =========================================================
  // GET /configurations/:configurationId/versions
  // =========================================================

  async findVersions(
    request: any,
    configurationId: string,
  ) {
    await this.requireConfigurationReadAccess(
      request,
      configurationId,
    );

    return this.prisma.carConfigurationVersion.findMany({
      where: {
        configurationId,
      },
      orderBy: {
        version: 'desc',
      },
      select: {
        id: true,
        configurationId: true,
        version: true,
        vibrationIsolation: true,
        additionalDescription: true,
        createdAt: true,
        historicalConfirmations: { select: { confirmedAt: true, registrationId: true } },
      },
    });
  }

  // =========================================================
  // GET /configurations/:configurationId/versions/:version
  // =========================================================

  async findVersion(
    request: any,
    configurationId: string,
    versionNumber: number,
  ) {
    await this.requireConfigurationReadAccess(
      request,
      configurationId,
    );

    const version =
      await this.prisma.carConfigurationVersion.findUnique({
        where: {
          configurationId_version: {
            configurationId,
            version: versionNumber,
          },
        },
        include: {
          headUnits: true,
          audioComponents: true,
          amplifiers: {
            include: {
              componentLinks: {
                select: {
                  amplifierId: true,
                  componentId: true,
                  quantity: true,
                },
              },
            },
          },
          batteries: true,
          generators: true,
        },
      });

    if (!version) {
      throw new NotFoundException(
        'Configuration version not found',
      );
    }

    return version;
  }

  // =========================================================
  // POST /cars/:carId/configurations
  // =========================================================

  async create(
    request: any,
    carId: string,
    dto: CreateConfigurationDto,
  ) {
    await this.requireCarAccess(
      request,
      carId,
    );

    const existing =
      await this.prisma.carConfiguration.findFirst({
        where: {
          carId,
          name: dto.name,
          isActive: true,
        },
        select: {
          id: true,
        },
      });

    if (existing) {
      throw new BadRequestException(
        `Configuration "${dto.name}" already exists for this car`,
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        await this.validateCatalogVersion(tx, dto);
        const configuration =
          await tx.carConfiguration.create({
            data: {
              carId,
              name: dto.name,
              currentVersion: 1,
            },
          });

        const version =
          await tx.carConfigurationVersion.create({
            data: {
              configurationId:
                configuration.id,
              version: 1,
              vibrationIsolation:
                dto.vibrationIsolation,
              additionalDescription:
                dto.additionalDescription,
            },
          });

        await this.createVersionChildren(
          tx,
          version.id,
          dto,
        );

        return tx.carConfiguration.findUnique({
          where: {
            id: configuration.id,
          },
          include: {
            versions: {
              where: {
                version: 1,
              },
              include: {
                historicalConfirmations: { select: { confirmedAt: true, registrationId: true } },
            headUnits: true,
                audioComponents: true,
                amplifiers: {
                  include: {
                    componentLinks: {
                      select: {
                        amplifierId: true,
                        componentId: true,
                        quantity: true,
                      },
                    },
                  },
                },
                batteries: true,
                generators: true,
              },
            },
          },
        });
      },
    );
  }

  // =========================================================
  // PUT /configurations/:configurationId
  // =========================================================

  async update(
    request: any,
    configurationId: string,
    dto: UpdateConfigurationDto,
  ) {
    const configuration = await this.requireConfigurationAccess(request, configurationId);
    if (!configuration) throw new NotFoundException('Configuration not found');

    const duplicate = await this.prisma.carConfiguration.findFirst({
      where: {
        carId: configuration.carId,
        name: dto.name,
        isActive: true,
        NOT: { id: configurationId },
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new BadRequestException(`Configuration "${dto.name}" already exists for this car`);
    }

    return this.prisma.$transaction(
      async (tx) => {
        const current = await tx.carConfiguration.findUnique({
          where: { id: configurationId },
          select: { id: true, currentVersion: true },
        });
        if (!current) throw new NotFoundException('Configuration not found');

        const currentVersion = await tx.carConfigurationVersion.findUnique({
          where: {
            configurationId_version: {
              configurationId,
              version: current.currentVersion,
            },
          },
          select: { id: true },
        });
        if (!currentVersion) throw new NotFoundException('Current configuration version not found');
        await this.validateCatalogVersion(tx, dto, currentVersion.id);

        // Every successful edit is an immutable new version, even if the
        // previous build was never registered at a stage. Do not delete or
        // overwrite earlier equipment rows: they form the member's audit trail.
        const next = await tx.carConfigurationVersion.create({ data: {
          configurationId, version: current.currentVersion + 1,
          vibrationIsolation: dto.vibrationIsolation, additionalDescription: dto.additionalDescription,
        } });
        await this.createVersionChildren(tx, next.id, dto);
        await tx.carConfiguration.update({
          where: { id: configurationId },
          data: { name: dto.name, currentVersion: next.version },
        });

        return tx.carConfiguration.findUnique({
          where: { id: configurationId },
          include: {
            versions: {
              orderBy: { version: 'desc' },
              include: {
                historicalConfirmations: { select: { confirmedAt: true, registrationId: true } },
            headUnits: true,
                audioComponents: true,
                amplifiers: { include: { componentLinks: { select: { amplifierId: true, componentId: true, quantity: true } } } },
                batteries: true,
                generators: true,
              },
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // =========================================================
  // POST /configurations/:configurationId/versions
  // =========================================================

  async createVersion(
    request: any,
    configurationId: string,
  ) {
    const configuration =
      await this.requireConfigurationAccess(
        request,
        configurationId,
      );

    return this.prisma.$transaction(
      async (tx) => {
        const currentVersion =
          await tx.carConfigurationVersion.findUnique({
            where: {
              configurationId_version: {
                configurationId,
                version:
                  configuration.currentVersion,
              },
            },
            include: {
              historicalConfirmations: { select: { confirmedAt: true, registrationId: true } },
            headUnits: true,
              audioComponents: true,
              amplifiers: {
                include: {
                  componentLinks: true,
                },
              },
              batteries: true,
              generators: true,
            },
          });

        if (!currentVersion) {
          throw new NotFoundException(
            'Current configuration version not found',
          );
        }

        const nextVersion =
          configuration.currentVersion + 1;

        const newVersion =
          await tx.carConfigurationVersion.create({
            data: {
              configurationId,
              version: nextVersion,
              vibrationIsolation:
                currentVersion.vibrationIsolation,
              additionalDescription:
                currentVersion.additionalDescription,
            },
          });

        const componentIdMap = new Map<
          string,
          string
        >();

        // -----------------------------------------------------
        // Head units
        // -----------------------------------------------------

        if (currentVersion.headUnits.length) {
          await tx.carHeadUnit.createMany({
            data: currentVersion.headUnits.map(
              (headUnit) => ({
                versionId: newVersion.id,
                catalogEntryId: headUnit.catalogEntryId ?? null,
                brand: headUnit.brand,
                model: headUnit.model,
                direction: headUnit.direction,
              }),
            ),
          });
        }

        // -----------------------------------------------------
        // Audio components
        // -----------------------------------------------------

        for (const component of
          currentVersion.audioComponents) {
          const created =
            await tx.carAudioComponent.create({
              data: {
                versionId: newVersion.id,
                catalogEntryId: component.catalogEntryId ?? null,
                brand: component.brand,
                model: component.model,
                quantity: component.quantity,
                type: component.type,
                direction: component.direction,
              },
            });

          componentIdMap.set(
            component.id,
            created.id,
          );
        }

        // -----------------------------------------------------
        // Amplifiers
        // -----------------------------------------------------

        for (const amplifier of
          currentVersion.amplifiers) {
          const created =
            await tx.carAmplifier.create({
              data: {
                versionId: newVersion.id,
                catalogEntryId: amplifier.catalogEntryId ?? null,
                brand: amplifier.brand,
                model: amplifier.model,
                quantity: amplifier.quantity,
                direction: amplifier.direction,
              },
            });

          const links =
            amplifier.componentLinks.map(
              (link) => {
                const newComponentId =
                  componentIdMap.get(
                    link.componentId,
                  );

                if (!newComponentId) {
                  throw new BadRequestException(
                    'Unable to map amplifier component link while creating new version',
                  );
                }

                return {
                  amplifierId: created.id,
                  componentId:
                    newComponentId,
                  quantity: link.quantity,
                };
              },
            );

          if (links.length) {
            await tx.carAmplifierComponent.createMany(
              {
                data: links,
              },
            );
          }
        }

        // -----------------------------------------------------
        // Batteries
        // -----------------------------------------------------

        if (currentVersion.batteries.length) {
          await tx.carBattery.createMany({
            data: currentVersion.batteries.map(
              (battery) => ({
                versionId: newVersion.id,
                brand: battery.brand,
                model: battery.model,
                quantity: battery.quantity,
              }),
            ),
          });
        }

        // -----------------------------------------------------
        // Generators
        // -----------------------------------------------------

        if (currentVersion.generators.length) {
          await tx.carGenerator.createMany({
            data: currentVersion.generators.map(
              (generator) => ({
                versionId: newVersion.id,
                brand: generator.brand,
                model: generator.model,
                quantity: generator.quantity,
              }),
            ),
          });
        }

        await tx.carConfiguration.update({
          where: {
            id: configurationId,
          },
          data: {
            currentVersion: nextVersion,
          },
        });

        return tx.carConfiguration.findUnique({
          where: {
            id: configurationId,
          },
          include: {
            versions: {
              where: {
                version: nextVersion,
              },
              include: {
                historicalConfirmations: { select: { confirmedAt: true, registrationId: true } },
            headUnits: true,
                audioComponents: true,
                amplifiers: {
                  include: {
                    componentLinks: {
                      select: {
                        amplifierId: true,
                        componentId: true,
                        quantity: true,
                      },
                    },
                  },
                },
                batteries: true,
                generators: true,
              },
            },
          },
        });
      },
    );
  }

  // =========================================================
  // DELETE /configurations/:configurationId
  // =========================================================

  async remove(
    request: any,
    configurationId: string,
  ) {
    await this.requireConfigurationAccess(
      request,
      configurationId,
    );

    await this.prisma.carConfiguration.update({
      where: { id: configurationId },
      data: { isActive: false },
    });

    return {
      success: true,
    };
  }

  // =========================================================
  // Create children for a version
  // =========================================================

  private async createVersionChildren(
    tx: any,
    versionId: string,
    dto: CreateConfigurationDto,
  ) {
    // Нормализуем необязательные массивы.
    // Это позволяет создавать пустую конфигурацию
    // только с name без передачи дочерних объектов.

    const headUnits =
      dto.headUnits ?? [];

    const audioComponents =
      dto.audioComponents ?? [];

    const amplifiers =
      dto.amplifiers ?? [];

    const batteries =
      dto.batteries ?? [];

    const generators =
      dto.generators ?? [];

    // -------------------------------------------------------
    // Head units
    // -------------------------------------------------------

    if (headUnits.length) {
      await tx.carHeadUnit.createMany({
        data: headUnits.map(
          (headUnit: CreateHeadUnitDto) => ({
            versionId,
            catalogEntryId: headUnit.catalogEntryId ?? null,
                brand: headUnit.brand,
            model: headUnit.model,
            direction: headUnit.direction,
          }),
        ),
      });
    }

    // -------------------------------------------------------
    // Audio components
    // -------------------------------------------------------

    const componentIdMap = new Map<
      number,
      string
    >();

    for (
      let index = 0;
      index < audioComponents.length;
      index++
    ) {
      const component =
        audioComponents[index];

      const created =
        await tx.carAudioComponent.create({
          data: {
            versionId,
            catalogEntryId: component.catalogEntryId ?? null,
                brand: component.brand,
            model: component.model,
            quantity: component.quantity,
            type: component.type,
            direction: component.direction,
          },
        });

      componentIdMap.set(
        index,
        created.id,
      );
    }

    // -------------------------------------------------------
    // Amplifiers
    // -------------------------------------------------------

    if (amplifiers.length) {
      await this.validateNewAmplifierLinks({
        audioComponents,
        amplifiers,
      });
    }

    for (const amplifier of amplifiers) {
      const created =
        await tx.carAmplifier.create({
          data: {
            versionId,
            catalogEntryId: amplifier.catalogEntryId ?? null,
                brand: amplifier.brand,
            model: amplifier.model,
            quantity: amplifier.quantity,
            direction: amplifier.direction,
          },
        });

      const links =
        (amplifier.componentLinks ?? []).map(
          (link) => {
            const index =
              Number(link.componentId);

            const componentId =
              componentIdMap.get(index);

            if (!componentId) {
              throw new BadRequestException(
                `Invalid audio component index: ${link.componentId}`,
              );
            }

            return {
              amplifierId: created.id,
              componentId,
              quantity: link.quantity,
            };
          },
        );

      if (links.length) {
        await tx.carAmplifierComponent.createMany(
          {
            data: links,
          },
        );
      }
    }

    // -------------------------------------------------------
    // Batteries
    // -------------------------------------------------------

    if (batteries.length) {
      await tx.carBattery.createMany({
        data: batteries.map(
          (battery: CreateBatteryDto) => ({
            versionId,
            brand: battery.brand,
            model: battery.model,
            quantity: battery.quantity,
          }),
        ),
      });
    }

    // -------------------------------------------------------
    // Generators
    // -------------------------------------------------------

    if (generators.length) {
      await tx.carGenerator.createMany({
        data: generators.map(
          (generator: CreateGeneratorDto) => ({
            versionId,
            brand: generator.brand,
            model: generator.model,
            quantity: generator.quantity,
          }),
        ),
      });
    }
  }

  private async validateNewAmplifierLinks(
    dto: Pick<
      CreateConfigurationDto,
      'audioComponents' | 'amplifiers'
    >,
  ) {
    const audioComponents =
      dto.audioComponents ?? [];

    const amplifiers =
      dto.amplifiers ?? [];

    for (const amplifier of amplifiers) {
      const componentLinks =
        amplifier.componentLinks ?? [];

      for (const link of componentLinks) {
        const index =
          Number(link.componentId);

        if (
          !Number.isInteger(index) ||
          index < 0 ||
          index >= audioComponents.length
        ) {
          throw new BadRequestException(
            `Invalid audio component index: ${link.componentId}`,
          );
        }

        const component =
          audioComponents[index];

        if (
          link.quantity >
          component.quantity
        ) {
          throw new BadRequestException(
            `Amplifier link quantity cannot exceed audio component quantity`,
          );
        }
      }
    }
  }
}