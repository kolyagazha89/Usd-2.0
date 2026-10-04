import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CreateDirectionDto {
  name: string;
  sortOrder?: number;
}

interface UpdateDirectionDto {
  name?: string;
  sortOrder?: number;
  isActive?: boolean;
}

interface CreateClassDto {
  directionId: string;
  code: string;
  name: string;
  sortOrder?: number;
}

interface UpdateClassDto {
  directionId?: string;
  code?: string;
  name?: string;
  sortOrder?: number;
  isActive?: boolean;
}

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================
  // DIRECTIONS
  // =========================================================

  async findAllDirections() {
    return this.prisma.direction.findMany({
      orderBy: [
        {
          sortOrder: 'asc',
        },
        {
          name: 'asc',
        },
      ],
      include: {
        classes: {
          orderBy: [
            {
              sortOrder: 'asc',
            },
            {
              name: 'asc',
            },
          ],
        },
      },
    });
  }

  async findDirection(id: string) {
    const direction = await this.prisma.direction.findUnique({
      where: {
        id,
      },
      include: {
        classes: {
          orderBy: [
            {
              sortOrder: 'asc',
            },
            {
              name: 'asc',
            },
          ],
        },
      },
    });

    if (!direction) {
      throw new NotFoundException('Направление не найдено');
    }

    return direction;
  }

  async createDirection(dto: CreateDirectionDto) {
    const name = dto.name?.trim();

    if (!name) {
      throw new BadRequestException('Название направления обязательно');
    }

    const existing = await this.prisma.direction.findFirst({
      where: {
        name,
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Направление "${name}" уже существует`,
      );
    }

    return this.prisma.direction.create({
      data: {
        name,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateDirection(id: string, dto: UpdateDirectionDto) {
    const direction = await this.prisma.direction.findUnique({
      where: {
        id,
      },
    });

    if (!direction) {
      throw new NotFoundException('Направление не найдено');
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();

      if (!name) {
        throw new BadRequestException(
          'Название направления не может быть пустым',
        );
      }

      const existing = await this.prisma.direction.findFirst({
        where: {
          name,
          NOT: {
            id,
          },
        },
      });

      if (existing) {
        throw new BadRequestException(
          `Направление "${name}" уже существует`,
        );
      }
    }

    return this.prisma.direction.update({
      where: {
        id,
      },
      data: {
        ...(dto.name !== undefined
          ? {
              name: dto.name.trim(),
            }
          : {}),
        ...(dto.sortOrder !== undefined
          ? {
              sortOrder: dto.sortOrder,
            }
          : {}),
        ...(dto.isActive !== undefined
          ? {
              isActive: dto.isActive,
            }
          : {}),
      },
      include: {
        classes: {
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
    });
  }

  async deleteDirection(id: string) {
    const direction = await this.prisma.direction.findUnique({
      where: {
        id,
      },
      include: {
        classes: true,
      },
    });

    if (!direction) {
      throw new NotFoundException('Направление не найдено');
    }

    if (direction.classes.some((item) => item.isActive)) {
      throw new BadRequestException(
        'Нельзя отключить направление, пока в нём есть активные классы',
      );
    }

    return this.prisma.direction.update({
      where: {
        id,
      },
      data: {
        isActive: false,
      },
    });
  }

  // =========================================================
  // CLASSES
  // =========================================================

  async findAllClasses(directionId?: string) {
    return this.prisma.class.findMany({
      where: {
        ...(directionId
          ? {
              directionId,
            }
          : {}),
      },
      orderBy: [
        {
          direction: {
            sortOrder: 'asc',
          },
        },
        {
          sortOrder: 'asc',
        },
        {
          name: 'asc',
        },
      ],
      include: {
        direction: true,
      },
    });
  }

  async findClass(id: string) {
    const item = await this.prisma.class.findUnique({
      where: {
        id,
      },
      include: {
        direction: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Класс не найден');
    }

    return item;
  }

  async createClass(dto: CreateClassDto) {
    const code = dto.code?.trim();
    const name = dto.name?.trim();

    if (!code) {
      throw new BadRequestException('Код класса обязателен');
    }

    if (!name) {
      throw new BadRequestException('Название класса обязательно');
    }

    const direction = await this.prisma.direction.findUnique({
      where: {
        id: dto.directionId,
      },
    });

    if (!direction) {
      throw new NotFoundException('Направление не найдено');
    }

    const existingCode = await this.prisma.class.findUnique({
      where: {
        code,
      },
    });

    if (existingCode) {
      throw new BadRequestException(
        `Класс с кодом "${code}" уже существует`,
      );
    }

    return this.prisma.class.create({
      data: {
        directionId: dto.directionId,
        code,
        name,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: {
        direction: true,
      },
    });
  }

  async updateClass(id: string, dto: UpdateClassDto) {
    const item = await this.prisma.class.findUnique({
      where: {
        id,
      },
    });

    if (!item) {
      throw new NotFoundException('Класс не найден');
    }

    if (dto.directionId !== undefined) {
      const direction = await this.prisma.direction.findUnique({
        where: {
          id: dto.directionId,
        },
      });

      if (!direction) {
        throw new NotFoundException('Направление не найдено');
      }
    }

    if (dto.code !== undefined) {
      const code = dto.code.trim();

      if (!code) {
        throw new BadRequestException('Код класса не может быть пустым');
      }

      const existing = await this.prisma.class.findUnique({
        where: {
          code,
        },
      });

      if (existing && existing.id !== id) {
        throw new BadRequestException(
          `Класс с кодом "${code}" уже существует`,
        );
      }
    }

    if (dto.name !== undefined && !dto.name.trim()) {
      throw new BadRequestException(
        'Название класса не может быть пустым',
      );
    }

    return this.prisma.class.update({
      where: {
        id,
      },
      data: {
        ...(dto.directionId !== undefined
          ? {
              directionId: dto.directionId,
            }
          : {}),
        ...(dto.code !== undefined
          ? {
              code: dto.code.trim(),
            }
          : {}),
        ...(dto.name !== undefined
          ? {
              name: dto.name.trim(),
            }
          : {}),
        ...(dto.sortOrder !== undefined
          ? {
              sortOrder: dto.sortOrder,
            }
          : {}),
        ...(dto.isActive !== undefined
          ? {
              isActive: dto.isActive,
            }
          : {}),
      },
      include: {
        direction: true,
      },
    });
  }

  async deleteClass(id: string) {
    const item = await this.prisma.class.findUnique({
      where: {
        id,
      },
    });

    if (!item) {
      throw new NotFoundException('Класс не найден');
    }

    return this.prisma.class.update({
      where: {
        id,
      },
      data: {
        isActive: false,
      },
      include: {
        direction: true,
      },
    });
  }

  // =========================================================
  // STAGE CLASSES
  // =========================================================

  async findStageClasses(stageId: string) {
    const stage = await this.prisma.stage.findFirst({
      where: {
        id: stageId,
        isDeleted: false,
      },
    });

    if (!stage) {
      throw new NotFoundException('Этап не найден');
    }

    const stageClasses = await this.prisma.stageClass.findMany({
      where: {
        stageId,
      },
      orderBy: [
        {
          class: {
            direction: {
              sortOrder: 'asc',
            },
          },
        },
        {
          class: {
            sortOrder: 'asc',
          },
        },
      ],
      include: {
        class: {
          include: {
            direction: true,
          },
        },
      },
    });

    return stageClasses;
  }

  async addClassToStage(stageId: string, classId: string) {
    const stage = await this.prisma.stage.findFirst({
      where: {
        id: stageId,
        isDeleted: false,
      },
    });

    if (!stage) {
      throw new NotFoundException('Этап не найден');
    }

    const item = await this.prisma.class.findFirst({
      where: {
        id: classId,
        isActive: true,
      },
      include: {
        direction: true,
      },
    });

    if (!item) {
      throw new NotFoundException(
        'Активный класс не найден',
      );
    }

    const existing = await this.prisma.stageClass.findUnique({
      where: {
        stageId_classId: {
          stageId,
          classId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Этот класс уже добавлен на этап',
      );
    }

    return this.prisma.stageClass.create({
      data: {
        stageId,
        classId,
      },
      include: {
        class: {
          include: {
            direction: true,
          },
        },
      },
    });
  }

  async removeClassFromStage(stageId: string, classId: string) {
    const existing = await this.prisma.stageClass.findUnique({
      where: {
        stageId_classId: {
          stageId,
          classId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(
        'Этот класс не привязан к этапу',
      );
    }

    await this.prisma.stageClass.delete({
      where: {
        id: existing.id,
      },
    });

    return {
      success: true,
      stageId,
      classId,
    };
  }

  async replaceStageClasses(
    stageId: string,
    classIds: string[],
  ) {
    const stage = await this.prisma.stage.findFirst({
      where: {
        id: stageId,
        isDeleted: false,
      },
    });

    if (!stage) {
      throw new NotFoundException('Этап не найден');
    }

    if (!Array.isArray(classIds)) {
      throw new BadRequestException(
        'classIds должен быть массивом',
      );
    }

    const uniqueClassIds = [...new Set(classIds)];

    const classes = await this.prisma.class.findMany({
      where: {
        id: {
          in: uniqueClassIds,
        },
        isActive: true,
      },
    });

    if (classes.length !== uniqueClassIds.length) {
      throw new BadRequestException(
        'Один или несколько классов не найдены или отключены',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.stageClass.deleteMany({
        where: {
          stageId,
        },
      });

      if (uniqueClassIds.length > 0) {
        await tx.stageClass.createMany({
          data: uniqueClassIds.map((classId) => ({
            stageId,
            classId,
          })),
        });
      }
    });

    return this.findStageClasses(stageId);
  }
}