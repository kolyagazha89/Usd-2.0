import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DataQualityService } from '../data-quality/data-quality.service';

const TYPES = new Set(['CODE_CHANGE', 'ASSISTANT_FUNCTION', 'SYSTEM_ACTION']);
const STATUSES = new Set(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED']);

@Injectable()
export class AssistantService {
  constructor(private readonly prisma: PrismaService, private readonly dataQuality: DataQualityService) {}

  async list() {
    const items = await this.prisma.assistantRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        requestedBy: { select: { id: true, name: true, email: true, role: true } },
        approvedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    return { success: true, items };
  }

  async create(body: Record<string, unknown>, userId: string) {
    const type = String(body.type ?? 'CODE_CHANGE');
    const title = String(body.title ?? '').trim();
    const prompt = String(body.prompt ?? '').trim();
    if (!TYPES.has(type)) throw new BadRequestException('Недопустимый тип запроса');
    if (!title || title.length > 160) throw new BadRequestException('Укажите короткое название запроса');
    if (!prompt || prompt.length > 12000) throw new BadRequestException('Опишите, что нужно изменить');
    const item = await this.prisma.assistantRequest.create({
      data: {
        type: type as any,
        status: 'DRAFT',
        title,
        prompt,
        plan: typeof body.plan === 'string' ? body.plan : null,
        diff: typeof body.diff === 'string' ? body.diff : null,
        risk: typeof body.risk === 'string' ? body.risk : null,
        requestedByUserId: userId,
        metadata: body.metadata && typeof body.metadata === 'object' ? (body.metadata as any) : undefined,
      },
      include: { requestedBy: { select: { id: true, name: true, email: true, role: true } } },
    });
    await this.prisma.auditLog.create({ data: { userId, action: 'ASSISTANT_REQUEST_CREATED', entity: 'AssistantRequest', entityId: item.id, metadata: { type, title } } });
    return { success: true, item };
  }

  async functions() {
    return { success: true, functions: [
      { code: 'DATA_QUALITY_SCAN', title: 'Проверка качества данных', description: 'Проверяет регистрации, инспекции, результаты, рекорды, автомобили и импорты.', risk: 'Низкий', confirmation: false },
      { code: 'STAGE_READINESS', title: 'Проверка готовности этапа', description: 'Проверяет активный этап, классы, регистрацию, инспекции, результаты и LIVE-настройки.', risk: 'Низкий', confirmation: false },
      { code: 'SYSTEM_SNAPSHOT', title: 'Снимок состояния системы', description: 'Показывает основные счётчики и состояние ключевых сущностей.', risk: 'Низкий', confirmation: false },
    ] };
  }

  async executeFunction(code: string, body: Record<string, unknown>, userId: string) {
    const allowed = new Set(['DATA_QUALITY_SCAN', 'STAGE_READINESS', 'SYSTEM_SNAPSHOT']);
    if (!allowed.has(code)) throw new BadRequestException('Функция ассистента не разрешена');
    let result: any;
    if (code === 'DATA_QUALITY_SCAN') result = await this.dataQuality.getReport();
    else if (code === 'SYSTEM_SNAPSHOT') {
      const [participants, cars, registrations, results, stages, imports] = await Promise.all([
        this.prisma.participant.count(), this.prisma.car.count(), this.prisma.registration.count(),
        this.prisma.result.count(), this.prisma.stage.count(), this.prisma.importJob.count(),
      ]);
      result = { success: true, counts: { participants, cars, registrations, results, stages, imports } };
    } else {
      const stageId = typeof body.stageId === 'string' ? body.stageId : undefined;
      const stage = stageId ? await this.prisma.stage.findUnique({ where: { id: stageId }, include: { classes: { where: { isActive: true } } } }) : await this.prisma.stage.findFirst({ orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], include: { classes: { where: { isActive: true } } } });
      if (!stage) throw new NotFoundException('Этап для проверки не найден');
      const [registrations, inspections, results] = await Promise.all([
        this.prisma.registration.count({ where: { stageId: stage.id, status: 'ACTIVE' } }),
        this.prisma.inspection.count({ where: { registration: { stageId: stage.id } } }),
        this.prisma.result.count({ where: { registration: { stageId: stage.id } } }),
      ]);
      result = { success: true, stage: { id: stage.id, name: stage.name, status: stage.status, registrationOpen: stage.registrationOpen, classes: stage.classes.length }, counts: { registrations, inspections, results }, ready: stage.classes.length > 0 && stage.status !== 'CANCELLED' };
    }
    await this.audit(userId, 'ASSISTANT_FUNCTION_EXECUTED', code);
    return { success: true, code, result };
  }

  async submit(id: string, userId: string) {
    const item = await this.get(id);
    if (item.status !== 'DRAFT' && item.status !== 'REJECTED') throw new BadRequestException('Запрос уже находится в работе');
    const updated = await this.prisma.assistantRequest.update({ where: { id }, data: { status: 'PENDING' } });
    await this.audit(userId, 'ASSISTANT_REQUEST_SUBMITTED', id);
    return { success: true, item: updated };
  }

  async approve(id: string, body: Record<string, unknown>, userId: string) {
    const item = await this.get(id);
    if (item.status !== 'PENDING') throw new BadRequestException('Подтверждать можно только запрос со статусом PENDING');
    if (String(body.confirmation ?? '').trim().toUpperCase() !== 'ПОДТВЕРЖДАЮ') {
      throw new BadRequestException('Для подтверждения введите «ПОДТВЕРЖДАЮ»');
    }
    const risk = String(item.risk ?? '').trim().toLowerCase();
    if ((risk === 'высокий' || risk === 'критический' || risk === 'high' || risk === 'critical') && item.requestedByUserId === userId) {
      throw new BadRequestException('Опасный запрос должен подтвердить другой ADMIN');
    }
    const updated = await this.prisma.assistantRequest.update({ where: { id }, data: { status: 'APPROVED', approvedByUserId: userId } });
    await this.audit(userId, 'ASSISTANT_REQUEST_APPROVED', id);
    return { success: true, item: updated, execution: { available: false, reason: 'Исполнитель кода не подключён. Запрос подтверждён и готов к безопасному применению после подключения GitHub executor.' } };
  }

  async reject(id: string, userId: string) {
    const item = await this.get(id);
    if (item.status !== 'PENDING') throw new BadRequestException('Отклонять можно только ожидающий запрос');
    const updated = await this.prisma.assistantRequest.update({ where: { id }, data: { status: 'REJECTED' } });
    await this.audit(userId, 'ASSISTANT_REQUEST_REJECTED', id);
    return { success: true, item: updated };
  }

  private async get(id: string) {
    const item = await this.prisma.assistantRequest.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Запрос ассистента не найден');
    return item;
  }

  private audit(userId: string, action: string, id: string) {
    return this.prisma.auditLog.create({ data: { userId, action, entity: 'AssistantRequest', entityId: id } });
  }
}
