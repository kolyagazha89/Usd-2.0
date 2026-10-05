import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DataQualityService } from '../data-quality/data-quality.service';

const TYPES = new Set(['CODE_CHANGE', 'ASSISTANT_FUNCTION', 'SYSTEM_ACTION']);
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

  async chat(message: string, userId: string) {
    const text = String(message ?? '').trim();
    if (!text || text.length > 12000) throw new BadRequestException('Сообщение пустое или слишком длинное');
    const lower = text.toLowerCase();
    const ai = await this.askModel(text, userId).catch(() => null);
    if (ai) return ai;
    if (/(провер|качество|ошибк|warning|проблем)/.test(lower)) {
      const report = await this.dataQuality.getReport();
      await this.audit(userId, 'ASSISTANT_CHAT_USED', 'DATA_QUALITY_SCAN');
      return { success: true, reply: report.healthy ? 'Проверил качество данных: критичных проблем сейчас не найдено.' : `Проверил качество данных: найдено проблем — ${report.counts.error} ошибок, ${report.counts.warning} предупреждений.`, action: null, data: report };
    }
    if (/(импорт|загрузк|warning|предупрежден)/.test(lower)) {
      const r = await this.executeFunction('IMPORT_DIAGNOSTICS', {}, userId);
      const p = r.result;
      return { success: true, reply: p.problemRows ? `Последний импорт требует внимания: ${p.problemRows} строк с предупреждениями в ${p.openJobs} незавершённых загрузках. Я могу помочь разобрать конкретную строку.` : 'Последний импорт выглядит чисто: незавершенных загрузок с предупреждениями не найдено.', action: null, data: p };
    }
    if (/(состояни|статус|сколько|счетчик|счётчик)/.test(lower)) {
      const r = await this.executeFunction('SYSTEM_SNAPSHOT', {}, userId);
      return { success: true, reply: `Сейчас в системе: ${r.result.counts.participants} участников, ${r.result.counts.cars} автомобилей, ${r.result.counts.registrations} регистраций и ${r.result.counts.results} результатов.`, action: null, data: r.result };
    }
    if (/(провер.*этап|готов.*этап|готовность этапа)/.test(lower)) {
      const r = await this.executeFunction('STAGE_READINESS', {}, userId);
      return { success: true, reply: r.result.ready ? `Этап «${r.result.stage.name}» выглядит готовым к работе: классов ${r.result.stage.classes}, регистраций ${r.result.counts.registrations}, инспекций ${r.result.counts.inspections}, результатов ${r.result.counts.results}.` : `Этап «${r.result.stage.name}» пока не готов: проверьте подключённые классы и статус этапа.`, action: null, data: r.result };
    }
    const item = await this.create({ type: 'CODE_CHANGE', title: 'Изменение по диалогу с USD Copilot', prompt: text, risk: 'Средний', metadata: { source: 'chat', scope: 'admin' } }, userId);
    const submitted = await this.submit(item.item.id, userId);
    return {
      success: true,
      reply: 'Понял. Это уже не просто вопрос, а задача на изменение. Я подготовил её отдельно, но ничего не применяю без твоего явного подтверждения.',
      action: { type: 'CHANGE_REQUEST', id: item.item.id, status: submitted.item.status, title: item.item.title, prompt: text, risk: item.item.risk ?? 'Средний' }
    };
  }

  private async askModel(text: string, userId: string) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return null;
    const model = process.env.OPENAI_MODEL?.trim() || 'gpt-6-astra';
    const context = await this.buildAssistantContext();
    const instructions = [
      'Ты — USD AI, интеллектуальный операционный ассистент системы USD 2.0.',
      'Отвечай на русском языке, естественно, уверенно и по делу. Ты должен рассуждать как опытный технический руководитель и оператор соревнований.',
      'Ты видишь только контекст, который передан ниже. Не выдумывай факты, цифры, записи, права или выполненные действия.',
      'Если пользователь просит изменить данные, настройки или код, не выполняй изменение молча: объясни план, последствия, риск и что именно потребуется подтвердить.',
      'Если вопрос можно решить диагностикой, сначала используй факты из контекста и дай конкретные следующие шаги.',
      'Если пользователь просит изменить код, подготовь понятный план изменения и укажи, что фактическое применение кода должно пройти через защищённую очередь запросов ассистента.',
      'Не показывай внутренние ID, токены, секреты и технические идентификаторы без прямой необходимости.',
      'Формат: короткий вывод -> детали -> что делать дальше. Не используй англоязычные статусы там, где есть русский эквивалент.',
      '',
      'АКТУАЛЬНЫЙ КОНТЕКСТ USD 2.0:',
      JSON.stringify(context),
    ].join('\n');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({ model, instructions, input: text, reasoning: { effort: 'high' }, max_output_tokens: 1800 }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) return null;
    const data: any = await response.json();
    const reply = typeof data?.output_text === 'string'
      ? data.output_text.trim()
      : Array.isArray(data?.output)
        ? data.output.flatMap((item: any) => item?.content ?? []).map((x: any) => x?.text ?? '').filter(Boolean).join('\n').trim()
        : '';
    if (!reply) return null;
    await this.audit(userId, 'ASSISTANT_AI_USED', model);
    return { success: true, reply, action: null, data: { model, contextGeneratedAt: new Date().toISOString() } };
  }

  private async buildAssistantContext() {
    const [participants, cars, registrations, results, stages, imports, pendingHistorical, activeDisqualifications, quality] = await Promise.all([
      this.prisma.participant.count(),
      this.prisma.car.count({ where: { isActive: true } }),
      this.prisma.registration.count({ where: { status: 'ACTIVE' } }),
      this.prisma.result.count(),
      this.prisma.stage.findMany({ orderBy: [{ date: 'asc' }, { stageNumber: 'asc' }], take: 8, select: { stageNumber: true, name: true, city: true, date: true, status: true, registrationOpen: true, stageClasses: { where: { isActive: true }, select: { id: true } } } }),
      this.prisma.importJob.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { status: true, createdAt: true, rows: { select: { status: true } } } }),
      this.prisma.result.count({ where: { isHistorical: true, verificationStatus: 'PENDING' } }),
      this.prisma.disqualification.count({ where: { status: 'ACTIVE' } }),
      this.dataQuality.getReport(),
    ]);
    return {
      counts: { participants, cars, registrations, results, pendingHistorical, activeDisqualifications },
      stages: stages.map((s) => ({ stageNumber: s.stageNumber, name: s.name, city: s.city, date: s.date, status: s.status, registrationOpen: s.registrationOpen, activeClasses: s.stageClasses.length })),
      imports: imports.map((j) => ({ status: j.status, createdAt: j.createdAt, rows: j.rows.reduce((a: any, r: any) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {}) })),
      dataQuality: quality.counts,
    };
  }

  async functions() {
    return { success: true, functions: [
      { code: 'DATA_QUALITY_SCAN', title: 'Проверка качества данных', description: 'Проверяет регистрации, инспекции, результаты, рекорды, автомобили и импорты.', risk: 'Низкий', confirmation: false },
      { code: 'STAGE_READINESS', title: 'Проверка готовности этапа', description: 'Проверяет активный этап, классы, регистрацию, инспекции, результаты и LIVE-настройки.', risk: 'Низкий', confirmation: false },
      { code: 'SYSTEM_SNAPSHOT', title: 'Снимок состояния системы', description: 'Показывает основные счётчики и состояние ключевых сущностей.', risk: 'Низкий', confirmation: false },
      { code: 'IMPORT_DIAGNOSTICS', title: 'Разбор импорта', description: 'Показывает незавершённые импорты, WARNING и распределение строк по статусам.', risk: 'Низкий', confirmation: false },
    ] };
  }

  async executeFunction(code: string, body: Record<string, unknown>, userId: string) {
    const allowed = new Set(['DATA_QUALITY_SCAN', 'STAGE_READINESS', 'SYSTEM_SNAPSHOT', 'IMPORT_DIAGNOSTICS']);
    if (!allowed.has(code)) throw new BadRequestException('Функция ассистента не разрешена');
    let result: any;
    if (code === 'DATA_QUALITY_SCAN') result = await this.dataQuality.getReport();
    else if (code === 'IMPORT_DIAGNOSTICS') {
      const [openJobs, problemRows, readyRows, resolvedRows, committedJobs] = await Promise.all([
        this.prisma.importJob.count({ where: { status: { in: ['DRAFT', 'READY'] } } }),
        this.prisma.importRow.count({ where: { status: 'WARNING', importJob: { status: { in: ['DRAFT', 'READY'] } } } }),
        this.prisma.importRow.count({ where: { status: 'READY', importJob: { status: { in: ['DRAFT', 'READY'] } } } }),
        this.prisma.importRow.count({ where: { status: 'RESOLVED', importJob: { status: { in: ['DRAFT', 'READY'] } } } }),
        this.prisma.importJob.count({ where: { status: 'COMMITTED' } }),
      ]);
      result = { openJobs, problemRows, readyRows, resolvedRows, committedJobs, healthy: problemRows === 0 };
    } else if (code === 'SYSTEM_SNAPSHOT') {
      const [participants, cars, registrations, results, stages, imports] = await Promise.all([
        this.prisma.participant.count(), this.prisma.car.count(), this.prisma.registration.count(),
        this.prisma.result.count(), this.prisma.stage.count(), this.prisma.importJob.count(),
      ]);
      result = { success: true, counts: { participants, cars, registrations, results, stages, imports } };
    } else {
      const stageId = typeof body.stageId === 'string' ? body.stageId : undefined;
      const stage = stageId ? await this.prisma.stage.findUnique({ where: { id: stageId }, include: { stageClasses: { where: { isActive: true }, select: { id: true } } } }) : await this.prisma.stage.findFirst({ orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], include: { stageClasses: { where: { isActive: true }, select: { id: true } } } });
      if (!stage) throw new NotFoundException('Этап для проверки не найден');
      const [registrations, inspections, results] = await Promise.all([
        this.prisma.registration.count({ where: { stageId: stage.id, status: 'ACTIVE' } }),
        this.prisma.inspection.count({ where: { registration: { stageId: stage.id } } }),
        this.prisma.result.count({ where: { registration: { stageId: stage.id } } }),
      ]);
      result = { success: true, stage: { name: stage.name, status: stage.status, registrationOpen: stage.registrationOpen, classes: stage.stageClasses.length }, counts: { registrations, inspections, results }, ready: stage.stageClasses.length > 0 && stage.status !== 'CANCELLED' };
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

  async apply(id: string, userId: string) {
    const item = await this.get(id);
    if (item.status !== 'APPROVED') {
      throw new BadRequestException('Выполнить можно только подтверждённый запрос');
    }

    const metadata = (item.metadata ?? {}) as Record<string, unknown>;
    const functionCode = typeof metadata.functionCode === 'string' ? metadata.functionCode : null;

    let execution: unknown = null;
    if (item.type === 'ASSISTANT_FUNCTION' && functionCode) {
      execution = await this.executeFunction(functionCode, (metadata.payload as Record<string, unknown>) ?? {}, userId);
    } else if (item.type === 'SYSTEM_ACTION') {
      const action = typeof metadata.action === 'string' ? metadata.action : null;
      if (action === 'DATA_QUALITY_SCAN' || action === 'SYSTEM_SNAPSHOT' || action === 'STAGE_READINESS') {
        execution = await this.executeFunction(action, (metadata.payload as Record<string, unknown>) ?? {}, userId);
      } else {
        throw new BadRequestException('Для системного запроса не выбрано разрешённое действие');
      }
    } else {
      throw new BadRequestException('Изменения кода требуют отдельного GitHub/PR исполнителя; production shell недоступен из админки');
    }

    const updated = await this.prisma.assistantRequest.update({
      where: { id },
      data: { status: 'APPLIED', appliedAt: new Date() },
    });
    await this.audit(userId, 'ASSISTANT_REQUEST_APPLIED', id);
    return { success: true, item: updated, execution };
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
