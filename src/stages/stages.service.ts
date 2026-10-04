import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CreateStageDto {
  seasonYear: number;
  seasonName?: string;
  stageNumber: number;
  name: string;
  city?: string;
  date: string;
  registrationOpen?: boolean;
  registrationStartsAt?: string;
  registrationEndsAt?: string;
}

@Injectable()
export class StagesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.stage.findMany({
      where: {
        isDeleted: false,
      },
      orderBy: [
        {
          date: 'desc',
        },
        {
          stageNumber: 'asc',
        },
      ],
      include: {
        season: true,
      },
    });
  }

  async findOne(id: string) {
    const stage = await this.prisma.stage.findFirst({
      where: {
        id,
        isDeleted: false,
      },
      include: {
        season: true,
        stageClasses: {
          include: {
            class: {
              include: {
                direction: true,
              },
            },
          },
          orderBy: {
            class: {
              sortOrder: 'asc',
            },
          },
        },
      },
    });

    if (!stage) {
      throw new NotFoundException('Этап не найден');
    }

    return stage;
  }

  async create(dto: CreateStageDto) {
    const date = new Date(dto.date);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Некорректная дата этапа');
    }

    if (!Number.isInteger(dto.seasonYear)) {
      throw new BadRequestException('Некорректный год сезона');
    }

    if (!Number.isInteger(dto.stageNumber) || dto.stageNumber < 1) {
      throw new BadRequestException(
        'Номер этапа должен быть положительным числом',
      );
    }

    const season = await this.prisma.season.upsert({
      where: {
        year: dto.seasonYear,
      },
      update: {
        ...(dto.seasonName ? { name: dto.seasonName } : {}),
      },
      create: {
        year: dto.seasonYear,
        name: dto.seasonName ?? `Сезон ${dto.seasonYear}`,
      },
    });

    const existingStage = await this.prisma.stage.findUnique({
      where: {
        seasonId_stageNumber: {
          seasonId: season.id,
          stageNumber: dto.stageNumber,
        },
      },
    });

    if (existingStage) {
  if (!existingStage.isDeleted) {
    throw new BadRequestException(
      `Этап №${dto.stageNumber} уже существует в сезоне ${dto.seasonYear}`,
    );
  }

  return this.prisma.stage.update({
    where: {
      id: existingStage.id,
    },
    data: {
      name: dto.name,
      city: dto.city,
      date,
      registrationOpen: dto.registrationOpen ?? false,
      registrationStartsAt: dto.registrationStartsAt
        ? new Date(dto.registrationStartsAt)
        : null,
      registrationEndsAt: dto.registrationEndsAt
        ? new Date(dto.registrationEndsAt)
        : null,
      isDeleted: false,
    },
    include: {
      season: true,
    },
  });
}

    return this.prisma.stage.create({
      data: {
        seasonId: season.id,
        stageNumber: dto.stageNumber,
        name: dto.name,
        city: dto.city,
        date,
        registrationOpen: dto.registrationOpen ?? false,
        registrationStartsAt: dto.registrationStartsAt
          ? new Date(dto.registrationStartsAt)
          : null,
        registrationEndsAt: dto.registrationEndsAt
          ? new Date(dto.registrationEndsAt)
          : null,
      },
      include: {
        season: true,
      },
    });
  }
    async update(
    id: string,
    dto: {
      stageNumber?: number;
      name?: string;
      city?: string;
      date?: string;
      registrationOpen?: boolean;
      registrationStartsAt?: string | null;
      registrationEndsAt?: string | null;
    },
  ) {
    const stage = await this.prisma.stage.findFirst({
      where: {
        id,
        isDeleted: false,
      },
    });

    if (!stage) {
      throw new NotFoundException('Этап не найден');
    }

    if (
      dto.stageNumber !== undefined &&
      (!Number.isInteger(dto.stageNumber) || dto.stageNumber < 1)
    ) {
      throw new BadRequestException(
        'Номер этапа должен быть положительным числом',
      );
    }

    if (dto.stageNumber !== undefined && dto.stageNumber !== stage.stageNumber) {
      const existingStage = await this.prisma.stage.findUnique({
        where: {
          seasonId_stageNumber: {
            seasonId: stage.seasonId,
            stageNumber: dto.stageNumber,
          },
        },
      });

      if (existingStage && existingStage.id !== id) {
        throw new BadRequestException(
          `Этап №${dto.stageNumber} уже существует в этом сезоне`,
        );
      }
    }

    let parsedDate: Date | undefined;

    if (dto.date !== undefined) {
      parsedDate = new Date(dto.date);

      if (Number.isNaN(parsedDate.getTime())) {
        throw new BadRequestException('Некорректная дата этапа');
      }
    }

    let registrationStartsAt: Date | null | undefined;
    let registrationEndsAt: Date | null | undefined;

    if (dto.registrationStartsAt !== undefined) {
      if (dto.registrationStartsAt === null) {
        registrationStartsAt = null;
      } else {
        registrationStartsAt = new Date(dto.registrationStartsAt);

        if (Number.isNaN(registrationStartsAt.getTime())) {
          throw new BadRequestException(
            'Некорректная дата начала регистрации',
          );
        }
      }
    }

    if (dto.registrationEndsAt !== undefined) {
      if (dto.registrationEndsAt === null) {
        registrationEndsAt = null;
      } else {
        registrationEndsAt = new Date(dto.registrationEndsAt);

        if (Number.isNaN(registrationEndsAt.getTime())) {
          throw new BadRequestException(
            'Некорректная дата окончания регистрации',
          );
        }
      }
    }

    return this.prisma.stage.update({
      where: {
        id,
      },
      data: {
        ...(dto.stageNumber !== undefined
          ? { stageNumber: dto.stageNumber }
          : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(parsedDate !== undefined ? { date: parsedDate } : {}),
        ...(dto.registrationOpen !== undefined
          ? { registrationOpen: dto.registrationOpen }
          : {}),
        ...(registrationStartsAt !== undefined
          ? { registrationStartsAt }
          : {}),
        ...(registrationEndsAt !== undefined
          ? { registrationEndsAt }
          : {}),
      },
      include: {
        season: true,
      },
    });
  }
  async remove(id: string) {
    const stage = await this.prisma.stage.findFirst({
      where: {
        id,
        isDeleted: false,
      },
    });

    if (!stage) {
      throw new NotFoundException('Этап не найден');
    }

    return this.prisma.stage.update({
      where: {
        id,
      },
      data: {
        isDeleted: true,
        registrationOpen: false,
      },
    });
  }
}