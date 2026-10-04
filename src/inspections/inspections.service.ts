import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InspectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string) {
    const inspection = await this.prisma.inspection.findUnique({
      where: { id },
      include: {
        registration: {
          include: {
            stage: {
              include: {
                season: true,
              },
            },
            participant: true,
            car: true,
            classes: {
              include: {
                class: {
                  include: {
                    direction: true,
                  },
                },
              },
            },
          },
        },
        checkedByUser: true,
      },
    });

    if (!inspection) {
      throw new NotFoundException('Инспекция не найдена');
    }

    return inspection;
  }

  async findByRegistration(registrationId: string) {
    const inspection = await this.prisma.inspection.findUnique({
      where: { registrationId },
      include: {
        registration: {
          include: {
            stage: {
              include: {
                season: true,
              },
            },
            participant: true,
            car: true,
            classes: {
              include: {
                class: {
                  include: {
                    direction: true,
                  },
                },
              },
            },
          },
        },
        checkedByUser: true,
      },
    });

    if (!inspection) {
      throw new NotFoundException(
        'Инспекция для данной регистрации не найдена',
      );
    }

    return inspection;
  }

  async create(data: {
  registrationId: string;
  checkedByUserId?: string;
  checkedByName?: string;
  notes?: string;
}) {
  const registration = await this.prisma.registration.findUnique({
    where: { id: data.registrationId },
    include: {
      inspection: true,
      stage: true,
    },
  });

  if (!registration) {
    throw new NotFoundException('Регистрация не найдена');
  }

  if (registration.status !== 'ACTIVE') {
    throw new ConflictException(
      'Нельзя провести инспекцию для неактивной регистрации',
    );
  }

  if (registration.stage.isDeleted) {
    throw new ConflictException(
      'Нельзя провести инспекцию для удалённого этапа',
    );
  }

  if (registration.inspection) {
    throw new ConflictException(
      'Для этой регистрации инспекция уже существует',
    );
  }

  if (data.checkedByUserId) {
    const user = await this.prisma.user.findUnique({
      where: { id: data.checkedByUserId },
    });

    if (!user) {
      throw new NotFoundException(
        'Пользователь, проводящий инспекцию, не найден',
      );
    }
  }

  return this.prisma.inspection.create({
    data: {
      registrationId: data.registrationId,

      // При создании инспекция всегда считается НЕ ПРОЙДЕННОЙ.
      // После проверки инспектор вручную меняет статус на PASSED.
      status: 'FAILED',

      checkedByUserId: data.checkedByUserId,
      checkedByName: data.checkedByName,
      notes: data.notes,
    },
    include: {
      registration: {
        include: {
          stage: {
            include: {
              season: true,
            },
          },
          participant: true,
          car: true,
          classes: {
            include: {
              class: {
                include: {
                  direction: true,
                },
              },
            },
          },
        },
      },
      checkedByUser: true,
    },
  });
}

  async update(
    id: string,
    data: {
      status?: 'PASSED' | 'FAILED';
      checkedByUserId?: string | null;
      checkedByName?: string | null;
      notes?: string | null;
    },
  ) {
    const inspection = await this.prisma.inspection.findUnique({
      where: { id },
    });

    if (!inspection) {
      throw new NotFoundException('Инспекция не найдена');
    }

    if (
      data.status !== undefined &&
      !['PASSED', 'FAILED'].includes(data.status)
    ) {
      throw new ConflictException(
        'Недопустимый статус инспекции',
      );
    }

    if (data.checkedByUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: data.checkedByUserId },
      });

      if (!user) {
        throw new NotFoundException(
          'Пользователь, проводящий инспекцию, не найден',
        );
      }
    }

    return this.prisma.inspection.update({
      where: { id },
      data: {
        ...(data.status !== undefined && {
          status: data.status,
        }),
        ...(data.checkedByUserId !== undefined && {
          checkedByUserId: data.checkedByUserId,
        }),
        ...(data.checkedByName !== undefined && {
          checkedByName: data.checkedByName,
        }),
        ...(data.notes !== undefined && {
          notes: data.notes,
        }),
      },
      include: {
        registration: {
          include: {
            stage: {
              include: {
                season: true,
              },
            },
            participant: true,
            car: true,
            classes: {
              include: {
                class: {
                  include: {
                    direction: true,
                  },
                },
              },
            },
          },
        },
        checkedByUser: true,
      },
    });
  }
}