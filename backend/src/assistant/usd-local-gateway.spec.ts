import {jest} from '@jest/globals';
import {askUsdLocalExpert,ollamaEndpoint,checkUsdLocalModel} from './usd-local-gateway';

const reply=(content:string,tool_calls?:unknown[])=>({ok:true,json:async()=>({message:{role:'assistant',content,tool_calls},done:true})} as Response);

describe('private Ollama USD AI',()=>{
 afterEach(()=>jest.restoreAllMocks());
 const base={model:'qwen3:1.7b',baseUrl:'http://ollama:11434',message:'Какие классы на этапе USD?',stageId:'stage-1',knowledge:'USD = чемпионат по автозвуку',history:[] as unknown[]};
 it('uses local design mode with architecture evidence, safe plans and a longer answer budget',async()=>{
  const mocked=jest.spyOn(global,'fetch')
   .mockResolvedValueOnce(reply('{"in_scope":true}'))
   .mockResolvedValueOnce(reply('1. Цель. 2. Два варианта. 3. Риски. 4. Тесты.'));
  const called:string[]=[];
  const result=await askUsdLocalExpert({...base,mode:'design',
   message:'Хочу изменить правила инспекции USD',
   runTool:async(name)=>{called.push(name);return {note:'Сохранять историю результатов'};},
  });
  expect(result.scope).toBe('usd');
  expect(result.usedTools).toEqual(['usd_project_docs','usd_rules']);
  expect(called).toEqual(['usd_project_docs','usd_rules']);
  const body=JSON.parse(String((mocked.mock.calls[1][1] as RequestInit).body));
  expect(body.messages[0].content).toMatch(/нестандартн.*сценарии/i);
  expect(body.messages[0].content).toContain('Сохранять историю результатов');
  expect(body.options.num_predict).toBeGreaterThan(650);
 });
 it('rejects non-USD questions before allowing local DB calls',async()=>{
  const fetchMock=jest.spyOn(global,'fetch').mockResolvedValueOnce(reply('{"in_scope":false}'));
  const runTool=jest.fn<()=>Promise<unknown>>();
  const answer=await askUsdLocalExpert({...base,message:'Какая погода?',runTool});
  expect(answer.scope).toBe('other');
  expect(answer.usedTools).toHaveLength(0);
  expect(runTool).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe('http://ollama:11434/api/chat');
  const payload=JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
  expect(payload.tools).toBeUndefined();
  expect(payload.messages.some((m:any)=>m.content.includes('email')&&m.role==='tool')).toBe(false);
 });
 it('calls only USD allowlisted read tools and returns a grounded answer',async()=>{
  const mock=jest.spyOn(global,'fetch')
   .mockResolvedValueOnce(reply('{"in_scope":true}'))
   .mockResolvedValueOnce(reply('',[{type:'function',function:{name:'usd_classes',arguments:{stageId:null}}}]))
   .mockResolvedValueOnce(reply('У выбранного этапа есть SPL и BassRace.'));
  const called:string[]=[];
  const answer=await askUsdLocalExpert({...base,runTool:async(name,args)=>{
   called.push(name);
   expect(args).toEqual({stageId:'stage-1'});
   return {classes:['SPL','BassRace']};
  }});
  expect(answer.scope).toBe('usd');
  expect(answer.reply).toContain('BassRace');
  expect(answer.usedTools).toEqual(['usd_classes']);
  expect(called).toEqual(['usd_classes']);
  expect(mock).toHaveBeenCalledTimes(3);
  const call=JSON.parse(String((mock.mock.calls[1][1] as RequestInit).body));
  expect(call.tools.every((t:any)=>t.type==='function'&&t.function.name.startsWith('usd_'))).toBe(true);
  const continuation=JSON.parse(String((mock.mock.calls[2][1] as RequestInit).body));
  expect(continuation.messages).toContainEqual(expect.objectContaining({
   role:'tool',tool_name:'usd_classes',content:expect.stringContaining('BassRace'),
  }));
 });
 it('never runs invented write tools',async()=>{
  const runTool=jest.fn<()=>Promise<unknown>>();
  jest.spyOn(global,'fetch')
   .mockResolvedValueOnce(reply('{"in_scope":true}'))
   .mockResolvedValueOnce(reply('',[{type:'function',function:{name:'execute_sql',arguments:{sql:'DROP TABLE participants'}}}]))
   .mockResolvedValueOnce(reply('Такой инструмент запрещён.'));
  const answer=await askUsdLocalExpert({...base,runTool});
  expect(runTool).not.toHaveBeenCalled();
  expect(answer.usedTools).toHaveLength(0);
 });
 it('fails closed when model cannot classify topic',async()=>{
  jest.spyOn(global,'fetch').mockResolvedValueOnce(reply('да, можно'));
  await expect(askUsdLocalExpert({...base,runTool:async()=>null})).rejects.toThrow();
 });
 it('rejects arbitrary HTTP destinations before sending any prompt',async()=>{
  const mock=jest.spyOn(global,'fetch');
  for(const url of ['https://example.com','http://169.254.169.254','http://localhost:9999','http://evil.internal:11434','file:///etc/passwd']){
   expect(()=>ollamaEndpoint(url)).toThrow();
  }
  expect(ollamaEndpoint('http://ollama:11434')).toBe('http://ollama:11434/api/chat');
  expect(mock).not.toHaveBeenCalled();
 });
 it('checks model installation without sending user content',async()=>{
  const mocked=jest.spyOn(global,'fetch').mockResolvedValue({ok:true,json:async()=>({models:[{name:'qwen3:1.7b'}]})} as Response);
  expect(await checkUsdLocalModel('http://ollama:11434','qwen3:1.7b')).toBe(true);
  expect(mocked.mock.calls[0][0]).toBe('http://ollama:11434/api/tags');
 });
});
