import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ResultsService } from '../results/results.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import type { CreateMeasurementDto } from './dto/create-measurement.dto';
import type { AcceptMeasurementDto, RejectMeasurementDto } from './dto/review-measurement.dto';

@Injectable()
export class MeasurementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resultsService: ResultsService,
  ) {}

  private assertStaff(request: AuthenticatedRequest) {
    if (!['ADMIN', 'JUDGE'].includes(request.user.role)) {
      throw new ForbiddenException('Измерения доступны только судье или администратору');
    }
  }

  private samePayload(existing: any, input: CreateMeasurementDto) {
    return existing.registrationId === input.registrationId
      && existing.registrationClassId === input.registrationClassId
      && existing.deviceType === input.deviceType
      && (existing.deviceSerial ?? null) === (input.deviceSerial ?? null)
      && existing.measurementType === input.measurementType
      && Number(existing.value) === input.value
      && existing.unit === input.unit
      && (existing.frequencyHz == null ? input.frequencyHz == null : Number(existing.frequencyHz) === input.frequencyHz)
      && (existing.durationMs ?? null) === (input.durationMs ?? null)
      && new Date(existing.measuredAt).getTime() === new Date(input.measuredAt).getTime();
  }

  private async existingByKey(idempotencyKey: string, input: CreateMeasurementDto) {
    const existing = await this.prisma.measurementSession.findUnique({ where: { idempotencyKey } });
    if (!existing) return null;
    if (!this.samePayload(existing, input)) {
      throw new ConflictException('Idempotency-Key уже использован для другого измерения');
    }
    return { ...existing, duplicate: true };
  }

  async create(input: CreateMeasurementDto, request: AuthenticatedRequest) {
    this.assertStaff(request);
    const duplicate = await this.existingByKey(input.idempotencyKey, input);
    if (duplicate) return duplicate;

    const registration = await this.prisma.registration.findUnique({
      where: { id: input.registrationId },
      include: {
        stage: { select: { id: true, isDeleted: true } },
        inspection: { select: { status: true } },
        classes: {
          where: { id: input.registrationClassId },
          include: { class: { select: { id: true, name: true, unit: true } } },
        },
      },
    });

    if (!registration || registration.stage.isDeleted) {
      throw new NotFoundException('Регистрация не найдена');
    }
    if (registration.status !== 'ACTIVE') {
      throw new ConflictException('Нельзя принять измерение для отменённой регистрации');
    }
    if (registration.inspection?.status !== 'PASSED') {
      throw new ConflictException('Перед измерением автомобиль должен пройти техосмотр');
    }
    const registrationClass = registration.classes[0];
    if (!registrationClass) {
      throw new ConflictException('Выбранный класс не относится к этой регистрации');
    }
    if (registrationClass.class.unit !== input.unit) {
      throw new ConflictException('Единица измерения не совпадает с единицей класса');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const session = await tx.measurementSession.create({
          data: {
            registrationId: input.registrationId,
            registrationClassId: input.registrationClassId,
            deviceType: input.deviceType.trim(),
            deviceSerial: input.deviceSerial?.trim() || null,
            measurementType: input.measurementType.trim(),
            value: input.value,
            unit: input.unit,
            frequencyHz: input.frequencyHz ?? null,
            durationMs: input.durationMs ?? null,
            measuredAt: new Date(input.measuredAt),
            rawData: input.rawData as any,
            idempotencyKey: input.idempotencyKey,
            capturedByUserId: request.user.sub,
          },
          include: {
            registrationClass: { include: { class: true } },
            capturedByUser: { select: { id: true, name: true, role: true } },
          },
        });
        await tx.auditLog.create({
          data: {
            userId: request.user.sub,
            action: 'MEASUREMENT_RECEIVED',
            entity: 'MeasurementSession',
            entityId: session.id,
            ipAddress: request.ip,
            metadata: {
              registrationId: session.registrationId,
              registrationClassId: session.registrationClassId,
              deviceType: session.deviceType,
              measurementType: session.measurementType,
              value: String(session.value),
              unit: session.unit,
            },
          },
        });
        return { ...session, duplicate: false };
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        const racedDuplicate = await this.existingByKey(input.idempotencyKey, input);
        if (racedDuplicate) return racedDuplicate;
      }
      throw error;
    }
  }

  async findByRegistration(registrationId: string, request: AuthenticatedRequest) {
    this.assertStaff(request);
    const registration = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      select: { id: true },
    });
    if (!registration) throw new NotFoundException('Регистрация не найдена');

    return this.prisma.measurementSession.findMany({
      where: { registrationId },
      include: {
        registrationClass: { include: { class: { include: { direction: true } } } },
        capturedByUser: { select: { id: true, name: true, role: true } },
        reviewedByUser: { select: { id: true, name: true, role: true } },
        result: { select: { id: true, value: true, unit: true, place: true } },
      },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async accept(id: string, input: AcceptMeasurementDto, request: AuthenticatedRequest) {
    this.assertStaff(request);
    const session = await this.prisma.measurementSession.findUnique({
      where: { id },
      include: { result: true, registrationClass: { include: { class: true } } },
    });
    if (!session) throw new NotFoundException('Измерение не найдено');
    if (session.status === 'ACCEPTED') return session;
    if (session.status === 'REJECTED') {
      throw new ConflictException('Отклонённое измерение нельзя подтвердить повторно');
    }

    const result = await this.resultsService.create({
      registrationId: session.registrationId,
      registrationClassId: session.registrationClassId,
      value: Number(session.value),
      place: input.place,
      notes: input.note?.trim() || 'Результат подтверждён из приложения измерений',
      confirmed: true,
    }, request);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.measurementSession.update({
        where: { id },
        data: {
          status: 'ACCEPTED',
          reviewedByUserId: request.user.sub,
          reviewedAt: new Date(),
          reviewNote: input.note?.trim() || null,
          resultId: result.id,
        },
        include: {
          registrationClass: { include: { class: true } },
          capturedByUser: { select: { id: true, name: true, role: true } },
          reviewedByUser: { select: { id: true, name: true, role: true } },
          result: { select: { id: true, value: true, unit: true, place: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: request.user.sub,
          action: 'MEASUREMENT_ACCEPTED',
          entity: 'MeasurementSession',
          entityId: id,
          ipAddress: request.ip,
          metadata: { resultId: result.id, place: input.place ?? null },
        },
      });
      return updated;
    });
  }

  async reject(id: string, input: RejectMeasurementDto, request: AuthenticatedRequest) {
    this.assertStaff(request);
    const session = await this.prisma.measurementSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Измерение не найдено');
    if (session.status === 'ACCEPTED') {
      throw new ConflictException('Подтверждённое измерение нельзя отклонить: исправление результата выполняет администратор');
    }
    if (session.status === 'REJECTED') return session;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.measurementSession.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewedByUserId: request.user.sub,
          reviewedAt: new Date(),
          reviewNote: input.note.trim(),
        },
      });
      await tx.auditLog.create({
        data: {
          userId: request.user.sub,
          action: 'MEASUREMENT_REJECTED',
          entity: 'MeasurementSession',
          entityId: id,
          ipAddress: request.ip,
          metadata: { note: input.note.trim() },
        },
      });
      return updated;
    });
  }
}
