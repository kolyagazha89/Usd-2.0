import { AssistantService } from './assistant.service';

const makeService = () => {
  const prisma: any = {
    assistantRequest: {create: jest.fn(), update: jest.fn()},
    auditLog: {create: jest.fn().mockResolvedValue({})},
    participant: {count: jest.fn().mockResolvedValue(32)},
    car: {count: jest.fn().mockResolvedValue(20)},
    registration: {count: jest.fn().mockResolvedValue(18)},
    result: {count: jest.fn().mockResolvedValue(9)},
    importJob: {count: jest.fn().mockResolvedValue(0)},
    importRow: {count: jest.fn().mockResolvedValue(0)},
    stage: {
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue({
        id:'stage-1', name:'Тестовый этап', status:'PUBLISHED',
        registrationOpen:false, stageClasses:[{id:'class-1'}],
      }),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    inspection: {count: jest.fn().mockResolvedValue(10)},
    participantStageInspection: {count: jest.fn().mockResolvedValue(10)},
    disqualification: {count: jest.fn().mockResolvedValue(0)},
  };
  const quality: any = {getReport: jest.fn().mockResolvedValue({
    healthy:false,
    counts:{error:2,warning:3,info:0},
    issues:[{code:'MISSING_INSPECTION',severity:'ERROR',message:'Не проведены инспекции',entity:'Registration'}],
  })};
  const service = new AssistantService(prisma,quality,{} as any);
  return {service,prisma,quality};
};

describe('USD assistant reliable operational chat', () => {
  const oldKey = process.env.OPENAI_API_KEY;
  beforeEach(() => { delete process.env.OPENAI_API_KEY; });
  afterAll(() => {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  });

  it('does not create unexecutable change requests from a natural-language instruction', async () => {
    const {service,prisma} = makeService();
    const answer = await service.chat('Измени дату этапа на завтра', 'admin');
    expect(answer.reply).toMatch(/не могу|не изменяю|не выполняю/i);
    expect(answer.action).toBeNull();
    expect(prisma.assistantRequest.create).not.toHaveBeenCalled();
  });

  it('answers stage readiness before generic status handlers, with links to relevant screens', async () => {
    const {service,prisma} = makeService();
    const answer = await service.chat('Проверь готовность этапа', 'admin');
    expect(answer.reply).toContain('Тестовый этап');
    expect(answer.data.stage.name).toBe('Тестовый этап');
    expect(answer.links.some((link: any) => link.href === '/admin/inspections')).toBe(true);
    expect(prisma.stage.findFirst).toHaveBeenCalled();
  });

  it('returns relevant quality issues rather than only a pair of counters', async () => {
    const {service} = makeService();
    const answer = await service.chat('Что сейчас требует внимания?', 'admin');
    expect(answer.reply).toContain('2');
    expect(answer.reply).toContain('Не проведены инспекции');
    expect(answer.links.length).toBeGreaterThan(0);
  });

  it('provides the judging workflow and does not pretend to have modified classes', async () => {
    const {service,prisma} = makeService();
    const answer = await service.chat('Как судье изменить класс и добавить BassRace?', 'admin');
    expect(answer.reply).toMatch(/BassRace/);
    expect(answer.links.some((link: any) => link.href === '/admin/registrations')).toBe(true);
    expect(prisma.assistantRequest.create).not.toHaveBeenCalled();
  });

  it('makes unavailable AI explicit, not a pretend conversation', async () => {
    const {service} = makeService();
    const answer = await service.chat('Расскажи о принципах работы чемпионата', 'admin');
    expect(answer.reply).toMatch(/ИИ|модел|OpenAI/);
    expect(answer.reply).not.toContain('Я понял тебя');
  });

  it('honors an explicitly selected stage while checking readiness', async () => {
    const {service,prisma} = makeService();
    prisma.stage.findUnique.mockResolvedValue({
      id:'selected-stage',name:'Выбранный этап',status:'PUBLISHED',
      registrationOpen:true,stageClasses:[{id:'c1'}],
    });
    const answer = await service.chat('Проверь этап', 'admin', {stageId:'selected-stage'});
    expect(prisma.stage.findUnique).toHaveBeenCalledWith(expect.objectContaining({where:{id:'selected-stage'}}));
    expect(answer.reply).toContain('Выбранный этап');
  });
});
