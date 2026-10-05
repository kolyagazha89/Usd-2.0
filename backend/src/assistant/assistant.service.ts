import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const TYPES = new Set(['CODE_CHANGE', 'ASSISTANT_FUNCTION', 'SYSTEM_ACTION']);
const STATUSES = new Set(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED']);

@Injectable()
export class AssistantService {
  constructor(private readonly prisma: PrismaService) {}

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
