import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordsService } from '../records/records.service';
import { ResultsRankingService } from './results-ranking.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import type { DeleteResultDto } from './dto/delete-result.dto';

@Injectable()
export class ResultDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recordsService: RecordsService,
    private readonly rankingService: ResultsRankingService,
  ) {}

  async delete(id: string, data: DeleteResultDto, request: AuthenticatedRequest) {
    if (request.user.role !== 'ADMIN') {
      throw new ForbiddenException('Удаление результатов доступно только ADMIN');
    }

    const reason = data.reason?.trim();
    if (data.confirmed !== true) {
      throw new ConflictException('Необходимо подтвердить удаление результата');
    }
    if (!reason) {
      throw new ConflictException('Укажите причину удаления результата');
    }

    const deleted = await this.prisma.$transaction(async (tx: any) => {
      const existing = await tx.result.findUnique({
        where: { id },
        include: {
          registration: {
            select: { id: true, stageId: true, participantId: true },
          },
          registrationClass: {
            select: { classId: true, class: { select: { name: true } } },
          },
        },
      });

      if (!existing) throw new NotFoundException('Результат не найден');
      if (existing.isHistorical) {
        throw new ConflictException(
          'Исторический результат удаляется через специальный административный workflow',
        );
      }

      // Preserve record history while detaching the record rows from the deleted result.
      await tx.record.updateMany({
        where: { resultId: id },
        data: { resultId: null, isCurrent: false, isManualOverride: false },
      });

      await tx.auditLog.create({
        data: {
          userId: request.user.sub,
          action: 'RESULT_DELETED',
          entity: 'Result',
          entityId: id,
          ipAddress: request.ip,
          metadata: {
            reason,
            registrationId: existing.registrationId,
            registrationClassId: existing.registrationClassId,
            classId: existing.registrationClass.classId,
            className: existing.registrationClass.class.name,
            value: existing.value.toString(),
            unit: existing.unit,
            place: existing.place,
            notes: existing.notes,
            isHistorical: existing.isHistorical,
          },
        },
      });

      await tx.result.delete({ where: { id } });
      return {
        stageId: existing.registration.stageId,
        classId: existing.registrationClass.classId,
      };
    }, { isolationLevel: 'Serializable' });

    const postProcessingWarnings: string[] = [];
    try {
      await this.recordsService.recalculateCurrentRecord(deleted.classId);
    } catch {
      postProcessingWarnings.push(
        'Результат удалён, но не удалось автоматически пересчитать рекорд класса. Проверьте рекорды в админке.',
      );
    }
    try {
      await this.rankingService.recalculateByStageClass(
        deleted.stageId,
        deleted.classId,
      );
    } catch {
      postProcessingWarnings.push(
        'Результат удалён, но не удалось автоматически пересчитать места в классе. Проверьте результаты этапа.',
      );
    }

    return {
      success: true,
      deletedResultId: id,
      postProcessingWarnings,
    };
  }
}
