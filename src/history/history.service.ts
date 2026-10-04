import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getParticipantHistory(participantId: string) {
    const participant = await this.prisma.participant.findUnique({
      where: {
        id: participantId,
      },
      include: {
        cars: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('Участник не найден');
    }

    const registrations = await this.prisma.registration.findMany({
      where: {
        participantId,
      },
      include: {
        stage: {
          include: {
            season: true,
          },
        },
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
        inspection: true,
        results: {
          include: {
            registrationClass: {
              include: {
                class: {
                  include: {
                    direction: true,
                  },
                },
              },
            },
          },
          orderBy: [
            {
              registrationClassId: 'asc',
            },
            {
              attemptNumber: 'asc',
            },
          ],
        },
      },
      orderBy: {
        registeredAt: 'desc',
      },
    });

    const records = await this.prisma.record.findMany({
      where: {
        participantId,
      },
      include: {
        class: {
          include: {
            direction: true,
          },
        },
        stage: {
          include: {
            season: true,
          },
        },
        result: {
          include: {
            registrationClass: {
              include: {
                class: true,
              },
            },
          },
        },
      },
      orderBy: [
        {
          achievedAt: 'desc',
        },
        {
          value: 'desc',
        },
      ],
    });

    const currentRecords = records.filter(
      (record) => record.isCurrent,
    );

    return {
      participant,
      cars: participant.cars,
      registrations,
      records,
      currentRecords,
      statistics: {
        registrationsCount: registrations.length,
        recordsCount: records.length,
        currentRecordsCount: currentRecords.length,
      },
    };
  }
}