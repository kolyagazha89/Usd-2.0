#!/usr/bin/env node
/**
 * Manual smoke test for an installed local model. No USD database or user data.
 * Run inside the existing API container only after the opt-in Ollama profile
 * and model were installed. Never called from ordinary deployments.
 */
const base=process.env.OLLAMA_BASE_URL||'http://ollama:11434';
const model=process.env.OLLAMA_MODEL||'qwen3:1.7b';
const url=new URL(base);
if(url.protocol!=='http:'||url.port!=='11434'||!['ollama','localhost','127.0.0.1'].includes(url.hostname)
  ||url.username||url.password||url.search||url.hash||(url.pathname!==''&&url.pathname!=='/')){
 console.error('UNSAFE_OLLAMA_ENDPOINT');process.exit(2);
}
const endpoint='http://'+url.hostname+':11434/api/chat';
let pass=0;
const ask=async(messages,extra={})=>{
 const res=await fetch(endpoint,{
  method:'POST',headers:{'Content-Type':'application/json'},
  signal:AbortSignal.timeout(110000),
  body:JSON.stringify({
   model,stream:false,think:false,keep_alive:'1m',
   options:{num_ctx:6144,num_predict:300,temperature:0},
   messages,...extra,
  }),
 });
 if(!res.ok)throw Error('OLLAMA_HTTP_'+res.status);
 const data=await res.json();
 if(!data?.done||!data?.message)throw Error('INCOMPLETE_OLLAMA_REPLY');
 return data.message;
};
const scope=async(question,expected)=>{
 const data=await ask([
  {role:'system',content:'USD = соревнования по автозвуку и их официальный сайт, НЕ валюта. По вопросу о погоде, кулинарии, валюте, политике — false. Для вопроса о судействе, этапах USD — true. Верни строго JSON {"in_scope":true/false}.'},
  {role:'user',content:question},
 ],{format:{type:'object',properties:{in_scope:{type:'boolean'}},required:['in_scope'],additionalProperties:false}});
 let accepted;
 try{accepted=JSON.parse(data.content).in_scope}catch{throw Error('SCOPE_NOT_JSON')}
 if(accepted!==expected)throw Error('SCOPE_MISMATCH');
 pass++;
};
try{
 await scope('Как судье изменить класс участника USD после инспекции?',true);
 await scope('Какая завтра погода в Москве?',false);
 const tool=await ask([
  {role:'system',content:'Ты помощник USD. Когда спрашивают о текущих числах, обязательно вызывай usd_snapshot, не придумывай числа.'},
  {role:'user',content:'Сколько сейчас регистраций в базе USD? Вызови usd_snapshot.'},
 ],{tools:[{type:'function',function:{name:'usd_snapshot',description:'Точные текущие показатели регистрации USD',parameters:{type:'object',properties:{},required:[]}}}]});
 if(!Array.isArray(tool.tool_calls)||!tool.tool_calls.some(t=>t?.function?.name==='usd_snapshot'))throw Error('NO_TOOL_CALL');
 pass++;
 console.log(JSON.stringify({success:true,model,checks:pass,info:'Synthetic questions only, no production DB was accessed'}));
}catch(error){
 console.error(JSON.stringify({success:false,model,checksPassed:pass,error:String(error?.message||error)}));
 process.exitCode=1;
}
