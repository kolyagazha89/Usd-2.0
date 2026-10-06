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

@Injectable()
export class ConfigurationsService {
  constructor(private readonly prisma: PrismaService) {}

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

    if (request.user?.role === 'ADMIN' || request.user?.role === 'JUDGE') {
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
    if (request.user?.role !== 'ADMIN' && request.user?.role !== 'JUDGE') {
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

        // PUT edits the current version in place. A new version is created
        // only by the explicit POST /versions action.
        await tx.carAmplifierComponent.deleteMany({
          where: { amplifier: { versionId: currentVersion.id } },
        });
        await tx.carHeadUnit.deleteMany({ where: { versionId: currentVersion.id } });
        await tx.carAudioComponent.deleteMany({ where: { versionId: currentVersion.id } });
        await tx.carAmplifier.deleteMany({ where: { versionId: currentVersion.id } });
        await tx.carBattery.deleteMany({ where: { versionId: currentVersion.id } });
        await tx.carGenerator.deleteMany({ where: { versionId: currentVersion.id } });

        await tx.carConfigurationVersion.update({
          where: { id: currentVersion.id },
          data: {
            vibrationIsolation: dto.vibrationIsolation,
            additionalDescription: dto.additionalDescription,
          },
        });

        await this.createVersionChildren(tx, currentVersion.id, dto);

        return tx.carConfiguration.findUnique({
          where: { id: configurationId },
          include: {
            versions: {
              orderBy: { version: 'desc' },
              include: {
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