import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { PrismaService } from '../prisma/prisma.service';
import { RegistrationCountry } from '../generated/prisma/enums';
import { isValidInternationalPhone, isValidRegistrationPlate } from './profile-validation';

@Injectable()
export class ParticipantsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // =========================================================
  // REGISTRATION NUMBER
  // =========================================================

  private validatePhone(value: string | null | undefined): string | null {
    const phone = this.optionalText(value);
    if (!phone) return null;
    if (!isValidInternationalPhone(phone)) {
      throw new BadRequestException(
        'Некорректный номер телефона. Укажите международный номер с кодом страны, например +7 999 123-45-67',
      );
    }
    return phone;
  }

  private normalizeRegistrationNumber(value: string, country?: RegistrationCountry): string {
    let number = value.normalize('NFKC')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[\u00A0\u202F]/g, ' ')
      .trim()
      .toLocaleUpperCase('ru-RU');
    if (country === 'RU') {
      const lookalikes: Record<string, string> = {
        A: 'А', B: 'В', E: 'Е', K: 'К', M: 'М',
        H: 'Н', O: 'О', P: 'Р', C: 'С', T: 'Т',
        Y: 'У', X: 'Х',
      };
      number = [...number]
        .map((char) => /[|\s.\-_/\\]/.test(char) ? '' : (lookalikes[char] ?? char))
        .join('');
    } else {
      number = number.replace(/\s+/g, ' ');
    }
    return number;
  }

  private plateIdentity(country: RegistrationCountry, value: string): string {
    return this.normalizeRegistrationNumber(value, country).replace(/[^\p{L}\p{N}]/gu, '');
  }

  private rethrowPlateConflict(error: unknown): never {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      throw new ConflictException('Автомобиль с таким госномером уже существует. Проверьте имеющийся автомобиль.');
    }
    throw error;
  }

  private async ensurePlateUnique(country: RegistrationCountry, number: string, excludeCarId?: string): Promise<void> {
    const candidates = await this.prisma.car.findMany({
      where: { registrationCountry: country, ...(excludeCarId ? { id: { not: excludeCarId } } : {}) },
      select: { id: true, registrationNumber: true },
    });
    const identity = this.plateIdentity(country, number);
    const duplicate = candidates.find(car => this.plateIdentity(country, car.registrationNumber) === identity);
    if (duplicate) {
      throw new ConflictException(`Автомобиль с госномером ${number} уже существует в базе. Проверьте существующий автомобиль вместо создания дубля.`);
    }
  }

  private validateRegistrationNumber(
    country: RegistrationCountry,
    value: string,
  ): string {
    const number = this.normalizeRegistrationNumber(value, country);
    if (!isValidRegistrationPlate(country, number)) {
      throw new BadRequestException(
        `Некорректный регистрационный номер для страны ${country}`,
      );
    }
    return number;
  }

  // =========================================================
  // ADMIN PARTICIPANTS
  // =========================================================

  async findAllAdmin(request: AuthenticatedRequest) {
    await this.requireAdmin(request);

    return this.prisma.participant.findMany({
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
      select: {
        id: true,
        lastName: true,
        firstName: true,
        middleName: true,
        team: true,
        phone: true,
        birthDate: true,
        city: true,
        photoUrl: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            emailVerifiedAt: true,
          },
        },
        _count: {
          select: {
            cars: true,
            registrations: true,
          },
        },
      },
    });
  }

  async findTeams(request: AuthenticatedRequest) {
    const user = await this.getAuthenticatedUser(request);
    if (!['ADMIN', 'PARTICIPANT'].includes(user.role)) {
      throw new ForbiddenException('Нет доступа к справочнику команд');
    }
    const [rows, settings] = await Promise.all([
      this.prisma.participant.findMany({
        where: { team: { not: null } },
        distinct: ['team'],
        orderBy: { team: 'asc' },
        select: { team: true },
      }),
      this.prisma.siteSettings.findUnique({ where: { id: 'default' }, select: { catalogs: true } }),
    ]);
    const catalog = (settings?.catalogs as any)?.teams;
    const names = [
      ...rows.map((row) => row.team?.trim()).filter((team): team is string => Boolean(team)),
      ...(Array.isArray(catalog) ? catalog.map((team: unknown) => String(team).trim()) : []),
    ];
    const canonical = new Map<string, string>();
    for (const raw of names) {
      const name = raw.replace(/\s+/g, ' ').trim();
      const key = name.toLocaleLowerCase('ru');
      if (name && !canonical.has(key)) canonical.set(key, name);
    }
    return [...canonical.values()]
      .sort((a, b) => a.localeCompare(b, 'ru'))
      .map((name) => ({ name }));
  }

  private async validateTeam(value: string | null | undefined): Promise<string | null> {
    const team = this.optionalText(value);
    if (!team) return null;

    const [rows, settings] = await Promise.all([
      this.prisma.participant.findMany({
        where: { team: { not: null } },
        distinct: ['team'],
        select: { team: true },
      }),
      this.prisma.siteSettings.findUnique({
        where: { id: 'default' },
        select: { catalogs: true },
      }),
    ]);
    const catalog = (settings?.catalogs as any)?.teams;
    const names = [
      ...rows.map((row) => row.team?.trim()).filter((name): name is string => Boolean(name)),
      ...(Array.isArray(catalog) ? catalog.map((name: unknown) => String(name).trim()) : []),
    ];
    const key = team.replace(/\s+/g, ' ').toLocaleLowerCase('ru');
    const match = names.find((name) => name.replace(/\s+/g, ' ').toLocaleLowerCase('ru') === key);
    if (!match) {
      throw new BadRequestException('Выберите команду из справочника или укажите «Без команды»');
    }
    return match.replace(/\s+/g, ' ').trim();
  }

  async findAllForOperations(request: AuthenticatedRequest) {
    await this.requireAdminOrCustomRole(request);
    return this.prisma.participant.findMany({
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        lastName: true,
        firstName: true,
        middleName: true,
        team: true,
        city: true,
        isPublic: true,
      },
    });
  }

  // =========================================================
  // PUBLIC PARTICIPANTS
  // =========================================================

  async findAll() {
    return this.prisma.participant.findMany({
      where: {
        isPublic: true,
      },
      orderBy: [
        {
          lastName: 'asc',
        },
        {
          firstName: 'asc',
        },
      ],
      select: {
        id: true,
        lastName: true,
        firstName: true,
        middleName: true,
        team: true,
        city: true,
        photoUrl: true,

        cars: {
          where: {
            isActive: true,
            isPublic: true,
          },
          orderBy: [
            {
              brand: 'asc',
            },
            {
              model: 'asc',
            },
          ],
          select: {
            id: true,
            brand: true,
            model: true,
            registrationCountry: true,
            
            color: true,
            photoUrl: true,
          },
        },
      },
    });
  }

  // =========================================================
  // PUBLIC PARTICIPANT PROFILE
  // =========================================================

  async findOne(id: string) {
    const participant =
      await this.prisma.participant.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          lastName: true,
          firstName: true,
          middleName: true,
          team: true,
          city: true,
          photoUrl: true,
          isPublic: true,

          cars: {
            where: {
              isActive: true,
              isPublic: true,
            },
            orderBy: [
              {
                brand: 'asc',
              },
              {
                model: 'asc',
              },
            ],
            select: {
              id: true,
              brand: true,
              model: true,
              registrationCountry: true,
              color: true,
              photoUrl: true,

              configurations: {
              where: { isActive: true },
              orderBy: {
                  updatedAt: 'desc',
                },
                select: {
                  id: true,
                  carId: true,
                  name: true,
                  currentVersion: true,
                  createdAt: true,
                  updatedAt: true,

                  versions: {
                    orderBy: {
                      version: 'desc',
                    },
                    take: 1,
                    select: {
                      id: true,
                      version: true,
                      vibrationIsolation: true,
                      additionalDescription: true,

                      headUnits: {
                        select: {
                          id: true,
                          brand: true,
                          model: true,
                          direction: true,
                        },
                        orderBy: [
                          {
                            direction: 'asc',
                          },
                          {
                            brand: 'asc',
                          },
                        ],
                      },

                      audioComponents: {
                        select: {
                          id: true,
                          brand: true,
                          model: true,
                          quantity: true,
                          type: true,
                          direction: true,
                        },
                        orderBy: [
                          {
                            direction: 'asc',
                          },
                          {
                            type: 'asc',
                          },
                          {
                            brand: 'asc',
                          },
                        ],
                      },

                      amplifiers: {
                        select: {
                          id: true,
                          brand: true,
                          model: true,
                          quantity: true,
                          direction: true,

                          componentLinks: {
                            select: {
                              quantity: true,

                              component: {
                                select: {
                                  id: true,
                                  brand: true,
                                  model: true,
                                  quantity: true,
                                  type: true,
                                  direction: true,
                                },
                              },
                            },
                          },
                        },
                        orderBy: [
                          {
                            direction: 'asc',
                          },
                          {
                            brand: 'asc',
                          },
                        ],
                      },

                      batteries: {
                        select: {
                          id: true,
                          brand: true,
                          model: true,
                          quantity: true,
                        },
                        orderBy: {
                          brand: 'asc',
                        },
                      },

                      generators: {
                        select: {
                          id: true,
                          brand: true,
                          model: true,
                          quantity: true,
                        },
                        orderBy: {
                          brand: 'asc',
                        },
                      },
                    },
                  },
                },
              },
            },
          },

          registrations: {
            where: {
              status: 'ACTIVE',
            },
            orderBy: {
              registeredAt: 'desc',
            },
            select: {
              id: true,
              participantNumber: true,
              registeredAt: true,

              stage: {
                select: {
                  id: true,
                  stageNumber: true,
                  name: true,
                  city: true,
                  date: true,

                  season: {
                    select: {
                      id: true,
                      name: true,
                      year: true,
                    },
                  },
                },
              },

              car: {
                select: {
                  id: true,
                  brand: true,
                  model: true,
                  registrationCountry: true,
                  color: true,
                  photoUrl: true,
                },
              },

              classes: {
                select: {
                  class: {
                    select: {
                      id: true,
                      code: true,
                      name: true,

                      direction: {
                        select: {
                          id: true,
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

    if (!participant || !participant.isPublic) {
      throw new NotFoundException(
        'Участник не найден',
      );
    }

    return participant;
  }

  // =========================================================
  // CURRENT USER
  // =========================================================

  async findMe(request: AuthenticatedRequest) {
    const user =
      await this.getAuthenticatedUser(request);

    if (!user.participantId) {
      return {
        hasProfile: false,
        participant: null,
      };
    }

    const participant =
      await this.prisma.participant.findUnique({
        where: {
          id: user.participantId,
        },
        select: {
          id: true,
          lastName: true,
          firstName: true,
          middleName: true,
          team: true,
          phone: true,
          photoUrl: true,
          birthDate: true,
          city: true,
          isPublic: true,

          user: {
            select: {
              id: true,
              email: true,
            },
          },

          cars: {
            where: {
              isActive: true,
            },
            orderBy: [
              {
                brand: 'asc',
              },
              {
                model: 'asc',
              },
            ],
            select: {
              id: true,
              brand: true,
              model: true,
              registrationCountry: true,
              color: true,
              photoUrl: true,
              isPublic: true,
              isActive: true,

              configurations: {
              where: { isActive: true },
              orderBy: {
                  updatedAt: 'desc',
                },
                select: {
                  id: true,
                  name: true,
                  currentVersion: true,
                  createdAt: true,
                  updatedAt: true,

                  versions: {
                    orderBy: {
                      version: 'desc',
                    },
                    take: 1,
                    select: {
                      id: true,
                      version: true,
                      vibrationIsolation: true,
                      additionalDescription: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

    if (!participant) {
      throw new NotFoundException(
        'Профиль участника не найден',
      );
    }

    return {
      hasProfile: true,
      participant,
    };
  }

  // =========================================================
  // CREATE CURRENT PARTICIPANT
  // =========================================================

  async createMe(
    request: AuthenticatedRequest,
    body: {
      lastName: string;
      firstName: string;
      middleName?: string | null;
      birthDate?: string | null;
      city?: string | null;
      team?: string | null;
      phone?: string | null;
      photoUrl?: string | null;
      isPublic?: boolean;
    },
  ) {
    const user =
      await this.getAuthenticatedUser(request);

    if (user.participantId) {
      throw new ConflictException(
        'Профиль участника уже существует',
      );
    }

    const lastName =
      this.requiredText(
        body.lastName,
        'Фамилия обязательна',
      );

    const firstName =
      this.requiredText(
        body.firstName,
        'Имя обязательно',
      );

    const middleName =
      this.optionalText(body.middleName);

    const birthDate =
      this.parseBirthDate(body.birthDate);

    const city =
      this.optionalText(body.city);

    const team =
      await this.validateTeam(body.team);

    const phone =
      this.validatePhone(body.phone);

    const photoUrl =
      this.optionalText(body.photoUrl);

    return this.prisma.$transaction(
      async (tx) => {
        const participant =
          await tx.participant.create({
            data: {
              lastName,
              firstName,
              middleName,
              birthDate,
              city,
              team,
              phone,
              photoUrl,
              isPublic:
                body.isPublic ?? true,
            },
          });

        await tx.user.update({
          where: {
            id: user.id,
          },
          data: {
            participantId: participant.id,
            name: `${firstName} ${lastName}`,
          },
        });

        return tx.participant.findUniqueOrThrow({
          where: {
            id: participant.id,
          },
          select: {
            id: true,
            lastName: true,
            firstName: true,
            middleName: true,
            team: true,
            phone: true,
            photoUrl: true,
            birthDate: true,
            city: true,
            isPublic: true,

            user: {
              select: {
                id: true,
                email: true,
                role: true,
              },
            },

            cars: {
              where: {
                isActive: true,
              },
              orderBy: [
                {
                  brand: 'asc',
                },
                {
                  model: 'asc',
                },
              ],
            },
          },
        });
      },
    );
  }

  // =========================================================
  // UPDATE CURRENT PARTICIPANT
  // =========================================================

  async updateMe(
    request: AuthenticatedRequest,
    body: {
      lastName?: string;
      firstName?: string;
      middleName?: string | null;
      birthDate?: string | null;
      city?: string | null;
      team?: string | null;
      phone?: string | null;
      photoUrl?: string | null;
      isPublic?: boolean;
    },
  ) {
    const user =
      await this.getAuthenticatedUser(request);

    const participantId =
      this.requireParticipantId(
        user.participantId,
      );

    const validatedBody = { ...body };
    if (Object.prototype.hasOwnProperty.call(body, 'team')) {
      validatedBody.team = await this.validateTeam(body.team);
    }
    return this.updateParticipantInternal(
      participantId,
      validatedBody,
    );
  }

  // =========================================================
  // ADMIN CREATE PARTICIPANT
  // =========================================================

  async createParticipant(
    request: AuthenticatedRequest,
    body: {
      lastName: string;
      firstName: string;
      middleName?: string | null;
      birthDate?: string | null;
      city?: string | null;
      team?: string | null;
      phone?: string | null;
      photoUrl?: string | null;
      isPublic?: boolean;
    },
  ) {
    await this.requireAdmin(request);

    const lastName =
      this.requiredText(
        body.lastName,
        'Фамилия обязательна',
      );

    const firstName =
      this.requiredText(
        body.firstName,
        'Имя обязательно',
      );

    return this.prisma.participant.create({
      data: {
        lastName,
        firstName,
        middleName:
          this.optionalText(body.middleName),
        birthDate:
          this.parseBirthDate(body.birthDate),
        city:
          this.optionalText(body.city),
        team:
          this.optionalText(body.team),
        phone:
          this.validatePhone(body.phone),
        photoUrl:
          this.optionalText(body.photoUrl),
        isPublic:
          body.isPublic ?? true,
      },
    });
  }

  // =========================================================
  // ADMIN UPDATE PARTICIPANT
  // =========================================================

  async updateParticipant(
  request: AuthenticatedRequest,
  id: string,
  body: {
    lastName?: string;
    firstName?: string;
    middleName?: string | null;
    birthDate?: string | null;
    city?: string | null;
    team?: string | null;
    phone?: string | null;
    photoUrl?: string | null;
    isPublic?: boolean;
  },
) {
  const user =
    await this.getAuthenticatedUser(request);

  // ADMIN может редактировать любого участника.
  if (user.role === 'ADMIN') {
    return this.updateParticipantInternal(
      id,
      body,
    );
  }


  // PARTICIPANT может редактировать только собственный профиль.
  if (
    user.role === 'PARTICIPANT' &&
    user.participantId !== id
  ) {
    throw new ForbiddenException(
      'Нет доступа к этому профилю',
    );
  }

  return this.updateParticipantInternal(
    id,
    body,
  );
}

  private async updateParticipantInternal(
    id: string,
    body: {
      lastName?: string;
      firstName?: string;
      middleName?: string | null;
      birthDate?: string | null;
      city?: string | null;
      team?: string | null;
      phone?: string | null;
      photoUrl?: string | null;
      isPublic?: boolean;
    },
  ) {
    await this.ensureParticipantExists(id);

    const data: {
      lastName?: string;
      firstName?: string;
      middleName?: string | null;
      birthDate?: Date | null;
      city?: string | null;
      team?: string | null;
      phone?: string | null;
      photoUrl?: string | null;
      isPublic?: boolean;
    } = {};

    if (body.lastName !== undefined) {
      data.lastName =
        this.requiredText(
          body.lastName,
          'Фамилия не может быть пустой',
        );
    }

    if (body.firstName !== undefined) {
      data.firstName =
        this.requiredText(
          body.firstName,
          'Имя не может быть пустым',
        );
    }

    if (body.middleName !== undefined) {
      data.middleName =
        this.optionalText(body.middleName);
    }

    if (body.birthDate !== undefined) {
      data.birthDate =
        this.parseBirthDate(body.birthDate);
    }

    if (body.city !== undefined) {
      data.city =
        this.optionalText(body.city);
    }

    if (body.team !== undefined) {
      data.team =
        this.optionalText(body.team);
    }

    if (body.phone !== undefined) {
      data.phone =
        this.validatePhone(body.phone);
    }

    if (body.photoUrl !== undefined) {
      data.photoUrl =
        this.optionalText(body.photoUrl);
    }

    if (body.isPublic !== undefined) {
      data.isPublic = body.isPublic;
    }

    const updated =
      await this.prisma.participant.update({
        where: {
          id,
        },
        data,
      });

    await this.prisma.user.updateMany({
      where: {
        participantId: id,
      },
      data: {
        name: `${updated.firstName} ${updated.lastName}`,
      },
    });

    return this.getPrivateParticipant(updated.id);
  }

  // =========================================================
  // ADMIN REMOVE PARTICIPANT
  // =========================================================

  async removeParticipant(
    request: AuthenticatedRequest,
    id: string,
  ) {
    await this.requireAdmin(request);

    await this.ensureParticipantExists(id);

    const registrationsCount =
      await this.prisma.registration.count({
        where: {
          participantId: id,
        },
      });

    if (registrationsCount > 0) {
      throw new ConflictException(
        'Нельзя удалить участника: у него есть регистрации на этапы',
      );
    }

    await this.prisma.$transaction([
      this.prisma.car.updateMany({
        where: {
          participantId: id,
        },
        data: {
          isActive: false,
        },
      }),

      this.prisma.participant.update({
        where: {
          id,
        },
        data: {
          isPublic: false,
        },
      }),
    ]);

    return {
      success: true,
      message: 'Участник деактивирован',
    };
  }

  // =========================================================
  // CURRENT PARTICIPANT CARS
  // =========================================================

  async findMyCars(
    request: AuthenticatedRequest,
  ) {
    const user =
      await this.getAuthenticatedUser(request);

    const participantId =
      this.requireParticipantId(
        user.participantId,
      );

    return this.findCarsInternal(
      participantId,
      true,
    );
  }

  async createMyCar(
    request: AuthenticatedRequest,
    body: {
      brand: string;
      model: string;
      registrationCountry: RegistrationCountry;
      registrationNumber: string;
      color?: string | null;
      photoUrl?: string | null;
      isPublic?: boolean;
    },
  ) {
    const user =
      await this.getAuthenticatedUser(request);

    const participantId =
      this.requireParticipantId(
        user.participantId,
      );

    return this.createCarInternal(
      participantId,
      body,
    );
  }

  // =========================================================
  // ADMIN / CUSTOM ROLE CARS OF PARTICIPANT
  // =========================================================

  async findCars(
    request: AuthenticatedRequest,
    participantId: string,
  ) {
    const user =
      await this.requireAdminOrCustomRole(request);

    return this.findCarsInternal(
      participantId,
      Boolean(user.customRoleId),
    );
  }

  // =========================================================
  // ALL CARS FOR ADMIN / CUSTOM ROLE
  // =========================================================

  async findAllCars(
    request: AuthenticatedRequest,
  ) {
    const user =
      await this.requireAdminOrCustomRole(request);

    return this.prisma.car.findMany({
      where:
        Boolean(user.customRoleId)
          ? {
              isActive: true,
            }
          : undefined,

      orderBy: [
        {
          isActive: 'desc',
        },
        {
          brand: 'asc',
        },
        {
          model: 'asc',
        },
      ],

      select: {
        id: true,
        participantId: true,
        brand: true,
        model: true,
        registrationCountry: true,
        registrationNumber: true,
        color: true,
        photoUrl: true,
        isPublic: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,

        participant: {
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

        configurations: {
              where: { isActive: true },
              orderBy: {
            updatedAt: 'desc',
          },
          select: {
            id: true,
            name: true,
            currentVersion: true,
            createdAt: true,
            updatedAt: true,

            versions: {
              orderBy: {
                version: 'desc',
              },
              take: 1,
              select: {
                id: true,
                version: true,
                vibrationIsolation: true,
                additionalDescription: true,
              },
            },
          },
        },
      },
    });
  }

  private async findCarsInternal(
    participantId: string,
    activeOnly: boolean,
  ) {
    await this.ensureParticipantExists(
      participantId,
    );

    return this.prisma.car.findMany({
      where: {
        participantId,
        ...(activeOnly
          ? {
              isActive: true,
            }
          : {}),
      },

      orderBy: [
        {
          isActive: 'desc',
        },
        {
          brand: 'asc',
        },
        {
          model: 'asc',
        },
      ],

      select: {
        id: true,
        participantId: true,
        brand: true,
        model: true,
        registrationCountry: true,
        registrationNumber: true,
        color: true,
        photoUrl: true,
        isPublic: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,

        configurations: {
              where: { isActive: true },
              orderBy: {
            updatedAt: 'desc',
          },
          select: {
            id: true,
            name: true,
            currentVersion: true,
            createdAt: true,
            updatedAt: true,

            versions: {
              orderBy: {
                version: 'desc',
              },
              take: 1,
              select: {
                id: true,
                version: true,
                vibrationIsolation: true,
                additionalDescription: true,
              },
            },
          },
        },
      },
    });
  }

  // =========================================================
  // ADMIN CREATE CAR
  // =========================================================

  async createCar(
    request: AuthenticatedRequest,
    participantId: string,
    body: {
      brand: string;
      model: string;
      registrationCountry: RegistrationCountry;
      registrationNumber: string;
      color?: string | null;
      photoUrl?: string | null;
      isPublic?: boolean;
    },
  ) {
    await this.requireAdmin(request);

    return this.createCarInternal(
      participantId,
      body,
    );
  }

  private async createCarInternal(
    participantId: string,
    body: {
      brand: string;
      model: string;
      registrationCountry: RegistrationCountry;
      registrationNumber: string;
      color?: string | null;
      photoUrl?: string | null;
      isPublic?: boolean;
    },
  ) {
    await this.ensureParticipantExists(
      participantId,
    );

    const brand =
      this.requiredText(
        body.brand,
        'Марка автомобиля обязательна',
      );

    const model =
      this.requiredText(
        body.model,
        'Модель автомобиля обязательна',
      );

    const registrationNumber =
      this.requiredText(
        body.registrationNumber,
        'Госномер автомобиля обязателен',
      );

    const registrationCountry =
      body.registrationCountry;

    if (!registrationCountry) {
      throw new BadRequestException(
        'Страна регистрации автомобиля обязательна',
      );
    }

    const normalizedRegistrationNumber =
      this.validateRegistrationNumber(
        registrationCountry,
        registrationNumber,
      );

    await this.ensurePlateUnique(registrationCountry, normalizedRegistrationNumber);

    return this.prisma.car.create({
      data: {
        participantId,
        brand,
        model,
        registrationCountry,
        registrationNumber:
          normalizedRegistrationNumber,
        color:
          this.optionalText(body.color),
        photoUrl:
          this.optionalText(body.photoUrl),
        isPublic:
          body.isPublic ?? true,
      },

      select: {
        id: true,
        participantId: true,
        brand: true,
        model: true,
        registrationCountry: true,
        registrationNumber: true,
        color: true,
        photoUrl: true,
        isPublic: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    }).catch((error: unknown) => this.rethrowPlateConflict(error));
  }

  // =========================================================
  // PUBLIC CAR
  // =========================================================

  async findCar(id: string) {
    const car =
      await this.prisma.car.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          brand: true,
          model: true,
          registrationCountry: true,
          color: true,
          photoUrl: true,
          isPublic: true,
          isActive: true,

          participant: {
            select: {
              id: true,
              lastName: true,
              firstName: true,
              middleName: true,
              team: true,
              city: true,
              photoUrl: true,
              isPublic: true,
            },
          },

          configurations: {
              where: { isActive: true },
              orderBy: {
              updatedAt: 'desc',
            },
            select: {
              id: true,
              name: true,
              currentVersion: true,
              createdAt: true,
              updatedAt: true,

              versions: {
                orderBy: {
                  version: 'desc',
                },
                take: 1,
                select: {
                  id: true,
                  version: true,
                  vibrationIsolation: true,
                  additionalDescription: true,

                  headUnits: {
                    select: {
                      id: true,
                      brand: true,
                      model: true,
                      direction: true,
                    },
                  },

                  audioComponents: {
                    select: {
                      id: true,
                      brand: true,
                      model: true,
                      quantity: true,
                      type: true,
                      direction: true,
                    },
                  },

                  amplifiers: {
                    select: {
                      id: true,
                      brand: true,
                      model: true,
                      quantity: true,
                      direction: true,

                      componentLinks: {
                        select: {
                          quantity: true,

                          component: {
                            select: {
                              id: true,
                              brand: true,
                              model: true,
                              quantity: true,
                              type: true,
                              direction: true,
                            },
                          },
                        },
                      },
                    },
                  },

                  batteries: {
                    select: {
                      id: true,
                      brand: true,
                      model: true,
                      quantity: true,
                    },
                  },

                  generators: {
                    select: {
                      id: true,
                      brand: true,
                      model: true,
                      quantity: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

    if (
      !car ||
      !car.isActive ||
      !car.isPublic ||
      !car.participant.isPublic
    ) {
      throw new NotFoundException(
        'Автомобиль не найден',
      );
    }

    return car;
  }

  // =========================================================
  // UPDATE CAR
  // =========================================================

  async updateCar(
    request: AuthenticatedRequest,
    id: string,
    body: {
      brand?: string;
      model?: string;
      registrationCountry?: RegistrationCountry;
      registrationNumber?: string;
      color?: string | null;
      photoUrl?: string | null;
      isPublic?: boolean;
      isActive?: boolean;
    },
  ) {
    const user =
      await this.getAuthenticatedUser(request);

    if (Boolean(user.customRoleId)) {
      throw new ForbiddenException(
        'Судья может только просматривать автомобили',
      );
    }

    const car =
      await this.ensureCarExists(id);

    const isAdmin =
      user.role === 'ADMIN';

    if (
      !isAdmin &&
      car.participantId !==
        user.participantId
    ) {
      throw new ForbiddenException(
        'Нет доступа к этому автомобилю',
      );
    }

    const data: {
      brand?: string;
      model?: string;
      registrationCountry?: RegistrationCountry;
      registrationNumber?: string;
      color?: string | null;
      photoUrl?: string | null;
      isPublic?: boolean;
      isActive?: boolean;
    } = {};

    if (body.brand !== undefined) {
      data.brand =
        this.requiredText(
          body.brand,
          'Марка автомобиля не может быть пустой',
        );
    }

    if (body.model !== undefined) {
      data.model =
        this.requiredText(
          body.model,
          'Модель автомобиля не может быть пустой',
        );
    }

    const countryChanged =
      body.registrationCountry !== undefined;

    const numberChanged =
      body.registrationNumber !== undefined;

    if (
      countryChanged ||
      numberChanged
    ) {
      const finalCountry =
        body.registrationCountry ??
        car.registrationCountry;

      const finalNumber =
        body.registrationNumber ??
        car.registrationNumber;

      const requiredNumber =
        this.requiredText(
          finalNumber,
          'Госномер автомобиля не может быть пустым',
        );

      data.registrationCountry =
        finalCountry;

      data.registrationNumber =
        this.validateRegistrationNumber(
          finalCountry,
          requiredNumber,
        );
      await this.ensurePlateUnique(finalCountry, data.registrationNumber, id);
    }

    if (body.color !== undefined) {
      data.color =
        this.optionalText(body.color);
    }

    if (body.photoUrl !== undefined) {
      data.photoUrl =
        this.optionalText(body.photoUrl);
    }

    if (body.isPublic !== undefined) {
      data.isPublic = body.isPublic;
    }

    if (body.isActive !== undefined) {
      if (!isAdmin) {
        throw new ForbiddenException(
          'Только администратор может изменять активность автомобиля',
        );
      }

      if (body.isActive === false) {
        const activeRegistrations = await this.prisma.registration.count({
          where: {
            carId: id,
            status: 'ACTIVE',
          },
        });

        if (activeRegistrations > 0) {
          throw new ConflictException(
            'Нельзя деактивировать автомобиль: он участвует в активной регистрации',
          );
        }
      }

      data.isActive = body.isActive;
    }

    return this.prisma.car.update({
      where: {
        id,
      },
      data,

      select: {
        id: true,
        participantId: true,
        brand: true,
        model: true,
        registrationCountry: true,
        registrationNumber: true,
        color: true,
        photoUrl: true,
        isPublic: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,

        configurations: {
              where: { isActive: true },
              orderBy: {
            updatedAt: 'desc',
          },
          select: {
            id: true,
            name: true,
            currentVersion: true,
            createdAt: true,
            updatedAt: true,

            versions: {
              orderBy: {
                version: 'desc',
              },
              take: 1,
              select: {
                id: true,
                version: true,
                vibrationIsolation: true,
                additionalDescription: true,
              },
            },
          },
        },
      },
    }).catch((error: unknown) => this.rethrowPlateConflict(error));
  }

  // =========================================================
  // REMOVE CAR
  // =========================================================

  async removeCar(
    request: AuthenticatedRequest,
    id: string,
  ) {
    const user =
      await this.getAuthenticatedUser(request);

    if (Boolean(user.customRoleId)) {
      throw new ForbiddenException(
        'Судья может только просматривать автомобили',
      );
    }

    const car =
      await this.ensureCarExists(id);

    const isAdmin =
      user.role === 'ADMIN';

    if (
      !isAdmin &&
      car.participantId !==
        user.participantId
    ) {
      throw new ForbiddenException(
        'Нет доступа к этому автомобилю',
      );
    }

    const registrationsCount =
      await this.prisma.registration.count({
        where: {
          carId: id,
        },
      });

    if (registrationsCount > 0) {
      throw new ConflictException(
        'Нельзя удалить автомобиль: он использовался в регистрациях',
      );
    }

    await this.prisma.car.update({
      where: {
        id,
      },
      data: {
        isActive: false,
      },
    });

    return {
      success: true,
      message: 'Автомобиль деактивирован',
    };
  }

  // =========================================================
  // PRIVATE PARTICIPANT
  // =========================================================

  private async getPrivateParticipant(
    id: string,
  ) {
    const participant =
      await this.prisma.participant.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          lastName: true,
          firstName: true,
          middleName: true,
          team: true,
          phone: true,
          photoUrl: true,
          birthDate: true,
          city: true,
          isPublic: true,

          user: {
            select: {
              id: true,
              email: true,
              role: true,
            },
          },

          cars: {
            where: {
              isActive: true,
            },
            orderBy: [
              {
                brand: 'asc',
              },
              {
                model: 'asc',
              },
            ],
          },
        },
      });

    if (!participant) {
      throw new NotFoundException(
        'Участник не найден',
      );
    }

    return participant;
  }

  // =========================================================
  // AUTHORIZATION
  // =========================================================

  private async getAuthenticatedUser(
    request: AuthenticatedRequest,
  ) {
    const userId =
      request.user?.sub;

    if (!userId) {
      throw new UnauthorizedException(
        'Пользователь не определён',
      );
    }

    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          id: true,
          role: true,
          isActive: true,
          participantId: true,
          customRoleId: true,
        },
      });

    if (!user) {
      throw new UnauthorizedException(
        'Пользователь не найден',
      );
    }

    if (!user.isActive) {
      throw new ForbiddenException(
        'Пользователь деактивирован',
      );
    }

    return user;
  }

  private async requireAdmin(
    request: AuthenticatedRequest,
  ) {
    const user =
      await this.getAuthenticatedUser(request);

    if (user.role !== 'ADMIN' && !user.customRoleId) {
      throw new ForbiddenException(
        'Недостаточно прав для выполнения операции',
      );
    }

    return user;
  }

  private async requireAdminOrCustomRole(
    request: AuthenticatedRequest,
  ) {
    const user =
      await this.getAuthenticatedUser(request);

    if (
      user.role !== 'ADMIN' &&
      !user.customRoleId
    ) {
      throw new ForbiddenException(
        'Требуются права администратора или назначенная операционная роль',
      );
    }

    return user;
  }

  // =========================================================
  // VALIDATION / HELPERS
  // =========================================================

  private requireParticipantId(
    participantId: string | null,
  ) {
    if (!participantId) {
      throw new NotFoundException(
        'Профиль участника ещё не создан',
      );
    }

    return participantId;
  }

  private requiredText(
    value: string | null | undefined,
    message: string,
  ) {
    const result =
      value?.trim();

    if (!result) {
      throw new BadRequestException(
        message,
      );
    }

    return result;
  }

  private optionalText(
    value:
      | string
      | null
      | undefined,
  ) {
    const result =
      value?.trim();

    return result || null;
  }

  private parseBirthDate(
    value:
      | string
      | null
      | undefined,
  ) {
    if (
      value === undefined ||
      value === null ||
      value.trim() === ''
    ) {
      return null;
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      throw new BadRequestException(
        'Некорректная дата рождения',
      );
    }

    return date;
  }

  private async ensureParticipantExists(
    id: string,
  ) {
    const participant =
      await this.prisma.participant.findUnique({
        where: {
          id,
        },
      });

    if (!participant) {
      throw new NotFoundException(
        'Участник не найден',
      );
    }

    return participant;
  }

  private async ensureCarExists(
    id: string,
  ) {
    const car =
      await this.prisma.car.findUnique({
        where: {
          id,
        },
      });

    if (!car) {
      throw new NotFoundException(
        'Автомобиль не найден',
      );
    }

    return car;
  }
}