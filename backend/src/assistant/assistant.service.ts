import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DataQualityService } from '../data-quality/data-quality.service';
import { StatisticsService } from '../statistics/statistics.service';
import {classifyAssistantIntent,isAssistantWriteRequest,classifyStageQuestion,normalizeOperationalQuestion} from './assistant-intent';
import {askUsdExpert,USD_EXPERT_TOOL_NAMES,type UsdExpertTool,type UsdToolArgs} from './usd-ai-gateway';
import {USD_KNOWLEDGE_OVERVIEW} from './usd-knowledge';
import {usdExpertRead} from './usd-expert-readers';
import {searchUsdDocuments} from './usd-document-search';
import {askUsdLocalExpert,checkUsdLocalModel} from './usd-local-gateway';
import type {UsdAssistantMode} from './usd-design-mode';

const TYPES = new Set(['CODE_CHANGE', 'ASSISTANT_FUNCTION', 'SYSTEM_ACTION']);
@Injectable()
export class AssistantService {
  constructor(private readonly prisma: PrismaService, private readonly dataQuality: DataQualityService, private readonly statistics: StatisticsService) {}

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

  /** Chat answers are read-only. No code-change ticket is silently created. */
  async chat(message: string, userId: string, options: { history?: unknown; stageId?: unknown; mode?: unknown } = {}) {
    const text = String(message ?? '').trim();
    if (!text || text.length > 12000) throw new BadRequestException('Сообщение пустое или слишком длинное');
    if (options.mode!==undefined && options.mode!=='ask' && options.mode!=='design') {
      throw new BadRequestException('Неизвестный режим ассистента USD');
    }
    const mode:UsdAssistantMode=options.mode==='design'?'design':'ask';
    const links = (items: Array<[string, string]>) => items.map(([label, href]) => ({ label, href }));
    const stageId = typeof options.stageId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(options.stageId)
      ? options.stageId : undefined;

    const stageQuestion=mode==='ask'?classifyStageQuestion(text,options.history):null;
    if (mode==='ask' && !stageQuestion && isAssistantWriteRequest(text)) {
      await this.audit(userId, 'ASSISTANT_CHAT_USED', 'WRITE_GUIDANCE');
      return {
        success: true,
        reply: 'Я не изменяю записи и настройки через свободный текст. Это защищает результаты и историю соревнований от случайных изменений. Открой нужный раздел, внеси правку с правами администратора и проверь сохранённое значение. Запросы на изменение кода из чата автоматически не выполняются.',
        action: null, source: 'guide',
        links: links([['Регистрации и классы', '/admin/registrations'], ['Инспекции', '/admin/inspections'], ['Результаты', '/admin/results'], ['Этапы', '/admin/stages']]),
      };
    }

    // The common operational path never enters the local inference queue.
    const normalized=normalizeOperationalQuestion(text);
    if(stageQuestion){
      const {selection,kind}=stageQuestion;
      try{
        const {result}=await this.executeFunction('STAGE_READINESS',selection?{selection}:stageId?{stageId}:{},userId);
        const date=result.stage.date?' · '+new Date(result.stage.date).toLocaleDateString('ru-RU',{timeZone:'Asia/Yekaterinburg'}):'';
        const heading='Этап «'+result.stage.name+'»'+date;
        const reportUrl='/admin/stage-report?stageId='+encodeURIComponent(result.stage.id);
        if(kind==='classes'){
          const classes=await usdExpertRead(this.prisma,'usd_classes',{stageId:result.stage.id}) as Array<{direction:string;name:string;code:string}>;
          return {success:true,action:null,source:'database',reply:heading+'\n'+(classes.length?'Подключённые классы (до 100):\n'+classes.map(c=>c.direction+' — '+c.name).join('\n'):'Нет активных классов.'),links:links([['Отчёт этапа',reportUrl]]),data:{stage:result.stage,classes}};
        }
        if(kind==='results'){
          const protocol=await usdExpertRead(this.prisma,'usd_stage_results',{stageId:result.stage.id}) as {error?:string;note?:string;classes?:Array<{code:string;results:Array<{participant:string;number:number;place:number|null;value:unknown;unit:string}>}>};
          if(protocol.error)return {success:true,action:null,source:'guide',reply:protocol.error,links:[]};
          const leaders=(protocol.classes??[]).flatMap(group=>group.results.filter(r=>r.place===1).map(r=>group.code+': '+r.participant+' (№'+r.number+') — '+String(r.value)+' '+r.unit));
          return {success:true,action:null,source:'database',reply:heading+'\n'+(protocol.note??'')+'\n'+(leaders.length?'Первые места в доступной выборке (до 100 результатов):\n'+leaders.slice(0,30).join('\n'):'В доступной выборке нет подтверждённых записей с первым местом.')+'\nПолный протокол открой в отчёте этапа.',links:links([['Отчёт этапа',reportUrl],['Результаты','/admin/results']]),data:{stage:result.stage,protocol}};
        }
        const participants=await this.prisma.registration.groupBy({by:['participantId'],where:{stageId:result.stage.id,status:'ACTIVE'}});
        const c=result.counts;
        const status=result.stage.status==='COMPLETED'?'завершён':result.stage.status==='PUBLISHED'?'опубликован':result.stage.status==='DRAFT'?'черновик':result.stage.status==='CANCELLED'?'отменён':'уточни статус в отчёте';
        return {success:true,action:null,source:'database',
          data:{...result,counts:{...c,participants:participants.length}},
          reply:heading+'\nСтатус: '+status+'. Онлайн-регистрация '+(result.stage.registrationOpen?'открыта':'закрыта')+'.'+
            '\nУникальных участников: '+participants.length+
            '\nРегистраций: '+c.registrations+
            '\nАктивных классов: '+result.stage.classes+
            '\nРегистрации по инспекции: допущено '+c.passedInspections+', отказов '+c.failedInspections+', ожидают '+c.pendingInspections+
            '\nРезультатов: '+c.results+
            '\nУчастники считаются без повторов. Регистрация и стартовый номер — разные показатели.',
          links:links([['Отчёт этапа',reportUrl],['Регистрации','/admin/registrations'],['Результаты','/admin/results']])};
      }catch(error){
        if(error instanceof NotFoundException)return {success:true,action:null,source:'guide',links:[],reply:'Подходящий этап не найден. Выбери этап в настройках диалога и спроси о нём.'};
        throw error;
      }
    }
    const provider=process.env.USD_AI_PROVIDER?.trim().toLowerCase()||'openai';
    const directLocal=provider==='ollama'&&mode==='ask'&&new Set([
      'что сейчас требует внимания','проверь готовность этапа','проверь качество данных',
      'разбери последний импорт','как судье изменить класс и добавить bassrace',
      'покажи состояние системы','сколько участников','сколько регистраций',
    ]).has(normalized);
    if(!directLocal&&(provider==='ollama'||(provider==='openai'&&process.env.OPENAI_API_KEY?.trim()))){
      try{
        const isLocal=provider==='ollama';
        const model=isLocal
          ?process.env.OLLAMA_MODEL?.trim()||'qwen3:1.7b'
          :process.env.OPENAI_MODEL?.trim()||'gpt-4.1-mini';
        const answer=isLocal
          ?await askUsdLocalExpert({
            model,baseUrl:process.env.OLLAMA_BASE_URL?.trim()||'http://ollama:11434',
            message:text,history:options.history,stageId,mode,knowledge:USD_KNOWLEDGE_OVERVIEW,
            runTool:(name,args)=>this.runUsdTool(name,args,userId),
          })
          :await askUsdExpert({
            apiKey:process.env.OPENAI_API_KEY!.trim(),
            model,message:text,history:options.history,stageId,mode,
            knowledge:USD_KNOWLEDGE_OVERVIEW,
            runTool:(name,args)=>this.runUsdTool(name,args,userId),
          });
        await this.audit(userId,'ASSISTANT_AI_USED',provider+':'+model);
        return {
          success:true,action:null,reply:answer.reply,
          source:answer.scope==='other'?'guide':'ai',
          links:[],data:{toolsUsed:answer.usedTools,stageId:stageId??null,provider,mode},
        };
      }catch{
        return {
          success:true,action:null,source:'unavailable',links:[],
          reply:provider==='ollama'
           ?'Локальная модель USD сейчас недоступна или не смогла проверить вопрос. Убедись, что Ollama запущена и модель загружена. Данные не изменились.'
           :'USD AI сейчас не смог проверить вопрос. Никакие данные не изменились. Повтори запрос позже.',
        };
      }
    }
    if(provider!=='openai'&&!directLocal){
      return {success:true,action:null,source:'unavailable',links:[],
        reply:'Неизвестный провайдер USD AI. Проверь настройку USD_AI_PROVIDER на сервере.'};
    }

    if(mode==='design'){
      return {success:true,action:null,source:'unavailable',links:[],
        reply:'Режим обсуждения изменений требует подключенной AI-модели USD. Без модели я не буду выдавать шаблон за архитектурный анализ. Изменений в системе не было.'};
    }

    const intent = classifyAssistantIntent(text);
    if (intent === 'JUDGING_HELP') {
      await this.audit(userId, 'ASSISTANT_CHAT_USED', intent);
      return {
        success: true,
        reply: 'Рабочий порядок судьи: 1) Найди участника по стартовому номеру в регистрациях. 2) Если решение судьи меняет класс, сначала измени классы в регистрации и проверь стартовые номера. 3) При необходимости добавь отдельный номер BassRace — он не заменяет основной. 4) Проведи или исправь инспекцию, указав причину при отказе. 5) Внеси результат в правильный класс и перепроверь протокол. Изменение или удаление уже сохранённых результатов выполняет ADMIN.',
        action: null, source: 'guide',
        links: links([['Регистрации', '/admin/registrations'], ['Инспекции', '/admin/inspections'], ['Результаты', '/admin/results']]),
      };
    }
    if (intent === 'STAGE_READINESS') {
      const { result } = await this.executeFunction('STAGE_READINESS', stageId ? { stageId } : {}, userId);
      const warnings: string[] = result.warnings ?? [];
      return {
        success: true, action: null, source: 'database', data: result,
        reply: 'Этап «' + result.stage.name + '». Активных классов: ' + result.stage.classes +
          ', регистраций: ' + result.counts.registrations +
          ', допущенных инспекций: ' + result.counts.passedInspections +
          ', отказов: ' + result.counts.failedInspections +
          ', ожидают проверки: ' + result.counts.pendingInspections +
          ', результатов: ' + result.counts.results + '.' +
          (warnings.length ? '\nНужно проверить: ' + warnings.join('; ') + '.' : '\nОсновные параметры этапа настроены.'),
        links: links([['Этап', '/admin/stages'], ['Инспекции', '/admin/inspections'], ['Результаты', '/admin/results']]),
      };
    }
    if (intent === 'SYSTEM_SNAPSHOT') {
      const { result } = await this.executeFunction('SYSTEM_SNAPSHOT', {}, userId);
      const c = result.counts;
      return {
        success: true, action: null, source: 'database', data: result,
        reply: 'Состояние USD: участников — ' + c.participants + ', активных автомобилей — ' + c.cars +
          ', регистраций — ' + c.registrations + ', результатов — ' + c.results +
          ', этапов — ' + c.stages + ', импортов — ' + c.imports + '.',
        links: links([['Участники', '/admin/participants'], ['Регистрации', '/admin/registrations'], ['Результаты', '/admin/results']]),
      };
    }
    if (intent === 'IMPORT_DIAGNOSTICS') {
      const { result } = await this.executeFunction('IMPORT_DIAGNOSTICS', {}, userId);
      return {
        success: true, action: null, source: 'database', data: result,
        reply: 'Импорт: открытых задач — ' + result.openJobs + ', строк с предупреждениями — ' + result.problemRows +
          ', готовых — ' + result.readyRows + ', исправленных — ' + result.resolvedRows +
          ', завершённых загрузок — ' + result.committedJobs + '.' +
          (result.problemRows ? '\nОткрой импорт, проверь предупреждения до фиксации.' : '\nСреди открытых загрузок предупреждений нет.'),
        links: links([['Импорт', '/admin/import'], ['История результатов', '/admin/historical-results']]),
      };
    }
    if (intent === 'ATTENTION' || intent === 'DATA_QUALITY_SCAN') {
      const report = await this.dataQuality.getReport();
      const important = [...new Map(report.issues
        .filter((issue) => issue.severity !== 'INFO')
        .map((issue) => [issue.code, issue.message] as const)).values()].slice(0, 5);
      await this.audit(userId, 'ASSISTANT_CHAT_USED', intent);
      return {
        success: true, action: null, source: 'database',
        data: { generatedAt: report.generatedAt, counts: report.counts, issues: report.issues.slice(0, 20) },
        reply: 'Проверил данные USD: ошибок — ' + report.counts.error + ', предупреждений — ' + report.counts.warning + '.' +
          (important.length ? '\nВ первую очередь:\n' + important.map((item, i) => (i + 1) + '. ' + item).join('\n') : '\nПо встроенным правилам контроля проблем не обнаружено. Это не заменяет проверку судейских протоколов.'),
        links: links([['Контроль данных', '/admin/data-quality'], ['Инспекции', '/admin/inspections'], ['Импорт', '/admin/import']]),
      };
    }

    return {
      success: true, action: null,
      source: 'unavailable',
      reply: process.env.OPENAI_API_KEY?.trim()
        ? 'Сейчас не удалось получить ответ от AI-модели. Данные USD не изменились. Встроенные проверки работают — выбери одну из них ниже.'
        : 'ИИ-модель не подключена: на сервере не задан OPENAI_API_KEY. Я могу выполнять проверенные диагностические запросы к базе USD, но не буду выдавать за AI-ответ случайную заготовку.',
      links: links([['Контроль данных', '/admin/data-quality'], ['Этапы', '/admin/stages'], ['Регистрации', '/admin/registrations']]),
    };
  }

  async status() {
    const provider=process.env.USD_AI_PROVIDER?.trim().toLowerCase()||'openai';
    const local=provider==='ollama';
    const model=local?process.env.OLLAMA_MODEL?.trim()||'qwen3:1.7b'
      :process.env.OPENAI_MODEL?.trim()||'gpt-4.1-mini';
    const aiConfigured=local||Boolean(provider==='openai'&&process.env.OPENAI_API_KEY?.trim());
    const modelReady=local
      ?await checkUsdLocalModel(process.env.OLLAMA_BASE_URL?.trim()||'http://ollama:11434',model)
      :null;
    return {
      success:true,aiConfigured,provider,model,modelReady,
      scope:'USD_ONLY' as const,tools:USD_EXPERT_TOOL_NAMES.length,
      note:local
       ?modelReady?'Ollama доступна и модель загружена.':'Ollama недоступна или выбранная модель не загружена.'
       :'API-ключ не гарантирует доступность модели; проверь запросом.',
    };
  }

  async stages() {
    const items = await this.prisma.stage.findMany({
      where: { isDeleted: false },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 16,
      select: { id: true, name: true, date: true, status: true, city: true },
    });
    return { success: true, items };
  }

  /** Only read-only, explicitly allowed tools. Never dispatch model names to arbitrary APIs. */
  private async runUsdTool(name:UsdExpertTool,args:UsdToolArgs,userId:string):Promise<unknown>{
    if(name==='usd_snapshot')return (await this.executeFunction('SYSTEM_SNAPSHOT',{},userId)).result;
    if(name==='usd_stage_readiness'){
      const stageId=typeof args.stageId==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(args.stageId)
        ?args.stageId:undefined;
      return (await this.executeFunction('STAGE_READINESS',stageId?{stageId}:{},userId)).result;
    }
    if(name==='usd_import_diagnostics')return (await this.executeFunction('IMPORT_DIAGNOSTICS',{},userId)).result;
    if(name==='usd_data_quality'){
      const report=await this.dataQuality.getReport();
      return {counts:report.counts,issues:report.issues.slice(0,16).map(issue=>({
        severity:issue.severity,code:issue.code,message:issue.message,
      }))};
    }
    if(name==='usd_project_docs')return searchUsdDocuments(typeof args.query==='string'?args.query.slice(0,180):'',typeof args.document==='string'?args.document:'all');
    return usdExpertRead(this.prisma,name,args);
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
        this.prisma.participant.count(), this.prisma.car.count({ where: { isActive: true } }), this.prisma.registration.count({ where: { status: 'ACTIVE' } }),
        this.prisma.result.count(), this.prisma.stage.count(), this.prisma.importJob.count(),
      ]);
      result = { success: true, counts: { participants, cars, registrations, results, stages, imports } };
    } else {
      const stageId = typeof body.stageId === 'string' ? body.stageId : undefined;
      const include = { stageClasses: { where: { isActive: true }, select: { id: true } } };
      // Prefer a future/current stage, never an old completed stage by default.
      const upcoming = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const selection=body.selection;
      const stage = selection==='past'
        ? await this.prisma.stage.findFirst({where:{isDeleted:false,date:{lte:new Date()},status:{notIn:['DRAFT','CANCELLED']}},orderBy:[{date:'desc'},{createdAt:'desc'}],include})
        : selection==='upcoming'
        ? await this.prisma.stage.findFirst({where:{isDeleted:false,date:{gte:upcoming},status:{notIn:['DRAFT','CANCELLED','COMPLETED']}},orderBy:[{date:'asc'},{createdAt:'desc'}],include})
        : stageId
        ? await this.prisma.stage.findUnique({ where: { id: stageId }, include })
        : await this.prisma.stage.findFirst({ where: { isDeleted: false, date: { gte: upcoming }, status: { not: 'CANCELLED' } }, orderBy: [{ date: 'asc' }], include })
          ?? await this.prisma.stage.findFirst({ where: { isDeleted: false }, orderBy: [{ date: 'desc' }], include });
      if (!stage || stage.isDeleted) throw new NotFoundException('Этап для проверки не найден');
      const [registrations, passedInspections, failedInspections, results, missingClasses] = await Promise.all([
        this.prisma.registration.count({ where: { stageId: stage.id, status: 'ACTIVE' } }),
        this.prisma.registration.count({ where: { stageId: stage.id, status: 'ACTIVE', OR: [
          { stageInspection: { status: 'PASSED' } },
          { stageInspection: null, inspection: { status: 'PASSED' } },
        ] } }),
        this.prisma.registration.count({ where: { stageId: stage.id, status: 'ACTIVE', OR: [
          { stageInspection: { status: 'FAILED' } },
          { stageInspection: null, inspection: { status: 'FAILED' } },
        ] } }),
        this.prisma.result.count({ where: { registration: { stageId: stage.id } } }),
        this.prisma.registration.count({ where: { stageId: stage.id, status: 'ACTIVE', classes: { none: {} } } }),
      ]);
      const pendingInspections = Math.max(0, registrations - passedInspections - failedInspections);
      const warnings: string[] = [];
      if (!stage.stageClasses.length) warnings.push('не подключены классы');
      if (stage.status === 'DRAFT') warnings.push('этап в черновике');
      if (stage.status === 'CANCELLED') warnings.push('этап отменён');
      if (stage.status === 'COMPLETED') warnings.push('этап уже завершён');
      if (missingClasses) warnings.push('регистраций без классов: ' + missingClasses);
      if (failedInspections) warnings.push('отказов по инспекции: ' + failedInspections);
      if (pendingInspections) warnings.push('ожидают инспекции: ' + pendingInspections);
      result = {
        success: true,
        stage: { id: stage.id, name: stage.name, date: stage.date, status: stage.status, registrationOpen: stage.registrationOpen, classes: stage.stageClasses.length },
        counts: { registrations, inspections: passedInspections + failedInspections, passedInspections, failedInspections, pendingInspections, missingClasses, results },
        warnings, ready: warnings.length === 0,
      };
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
