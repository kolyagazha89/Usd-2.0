import {jest} from '@jest/globals';
import {loadUsdDesignEvidence,USD_CHANGE_DESIGN_PROMPT} from './usd-design-mode';

describe('USD change discussion mode',()=>{
 it('requires architecture and acceptance analysis instead of fake implementation',()=>{
  expect(USD_CHANGE_DESIGN_PROMPT).toMatch(/вариант/i);
  expect(USD_CHANGE_DESIGN_PROMPT).toMatch(/нестандартн/i);
  expect(USD_CHANGE_DESIGN_PROMPT).toMatch(/риск/i);
  expect(USD_CHANGE_DESIGN_PROMPT).toMatch(/тест/i);
  expect(USD_CHANGE_DESIGN_PROMPT).toMatch(/не (меняй|изменяй|выполняй)/i);
  expect(USD_CHANGE_DESIGN_PROMPT).toMatch(/план.*не.*реализ/i);
 });
 it('grounds proposals in design docs and judging rules without disclosing email',async()=>{
  const calls:string[]=[];
  const runTool=jest.fn<(name:any,args:any)=>Promise<any>>()
   .mockImplementation(async(name,args)=>{
    calls.push(name);
    if(name==='usd_rules'){expect(args.topic).toBe('inspection');return {rules:'Изменение классов проходит через регистрацию'};}
    expect(args.document).toBe('all');
    return {matches:[{path:'docs/USD_MASTER_PLAN.md',excerpt:'Инспекция test@example.com должна быть проверена'}]};
   });
  const result=await loadUsdDesignEvidence({
   query:'Что будет, если инспекция меняет класс на этапе USD?',
   runTool,
  });
  expect(calls).toEqual(['usd_project_docs','usd_rules']);
  expect(result.usedTools).toEqual(['usd_project_docs','usd_rules']);
  expect(result.context).toContain('docs/USD_MASTER_PLAN.md');
  expect(result.context).toContain('Изменение классов');
  expect(result.context).not.toContain('test@example.com');
 });
 it('uses strict size limits for retrieved text and tolerates unavailable rulebook',async()=>{
  const runTool=jest.fn<(name:any,args:any)=>Promise<any>>()
   .mockImplementation(async(name)=>{
    if(name==='usd_rules')throw new Error('DB unavailable');
    return {data:'X'.repeat(20000)};
   });
  const result=await loadUsdDesignEvidence({query:'Судейство на этапе USD',runTool,maxChars:2000});
  expect(result.context.length).toBeLessThanOrEqual(2000);
  expect(result.usedTools).toEqual(['usd_project_docs']);
 });
});
