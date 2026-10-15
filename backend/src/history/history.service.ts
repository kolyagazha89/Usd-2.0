import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getAuditLogs(options: { limit?: number; action?: string; entity?: string; entityId?: string }) {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    return this.prisma.auditLog.findMany({
      where: {
        ...(options.action ? { action: options.action } : {}),
        ...(options.entity ? { entity: options.entity } : {}),
        ...(options.entityId ? { entityId: options.entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        metadata: true,
        ipAddress: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });
  }

  async getParticipantHistory(participantId: string, role: 'ADMIN' | 'PARTICIPANT') {
    const participant = await this.prisma.participant.findUnique({
      where: { id: participantId },
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
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            brand: true,
            model: true,
            registrationCountry: true,
            registrationNumber: true,
            color: true,
            photoUrl: true,
            isPublic: true,
            isActive: true,
          },
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('Участник не найден');
    }

    const registrations = await this.prisma.registration.findMany({
      where: { participantId },
      select: {
        id: true,
        participantNumber: true,
        status: true,
        registeredAt: true,
        source: true,
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
            ...(role === 'ADMIN' ? { registrationNumber: true } : {}),
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
        inspection: {
          select: {
            id: true,
            status: true,
            notes: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        results: {
          select: {
            id: true,
            value: true,
            unit: true,
            place: true,
            notes: true,
            isBest: true,
            createdAt: true,
            registrationClass: {
              select: {
                id: true,
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
          orderBy: [
            { registrationClassId: 'asc' },
            { createdAt: 'asc' },
          ],
        },
      },
      orderBy: { registeredAt: 'desc' },
    });

    const records = await this.prisma.record.findMany({
      where: { participantId },
      select: {
        id: true,
        value: true,
        unit: true,
        achievedAt: true,
        isCurrent: true,
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
        result: {
          select: {
            id: true,
            value: true,
            unit: true,
            place: true,
            createdAt: true,
          },
        },
      },
      orderBy: [
        { achievedAt: 'desc' },
        { value: 'desc' },
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
