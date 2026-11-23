import type {UsdExpertTool,UsdToolArgs} from './usd-ai-gateway';

// Keep extraction independent of model provider code: both gateways import this module.
function redactSourceText(text:string):string {
 return text.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[email скрыт]')
  .replace(/(?<!\w)(?:\+?7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\w)/g,'[телефон скрыт]')
  .replace(/\bsk-[a-zA-Z0-9_-]{12,}\b/g,'[ключ скрыт]');
}

/** Applied only in the explicit read-only design discussion mode. */
export const USD_CHANGE_DESIGN_PROMPT=[
 'РЕЖИМ «ОБСУДИТЬ ИЗМЕНЕНИЕ» — архитектурный анализ предложения владельца USD, а НЕ поручение выполнить действия.',
 'Не меняй БД, настройки, результаты, файлы, GitHub и сервер. Не утверждай, что изменения реализованы. План не является реализацией.',
 'Не соглашайся автоматически: сравни минимум два варианта, оцени цену, совместимость и обоснованно рекомендуй один.',
 'Разделяй достоверное текущее состояние (только подтверждённые данные), требования из мастер-плана и гипотезы.',
 'Учитывай зависимости USD: онлайн/офлайн LAN и возврат этапа, классы SPL/BFSPL/BassRace/Storm Wall/BDW SPL, регистрация, инспекция, номера, судейство, результаты, история, роли, безопасность 152-ФЗ, мобильные экраны.',
 'Ответ структурируй краткими разделами: 1. Цель и текущие ограничения; 2. Варианты реализации; 3. Затронутые модули и данные; 4. Нестандартные сценарии; 5. Риски и обратная совместимость; 6. Рекомендуемый план реализации; 7. Тесты и критерии приёмки; 8. Что надо уточнить.',
 'Для каждого существенного утверждения по возможности укажи документ/раздел либо «по БД USD». Если источник неизвестен, прямо напиши «требует проверки кода/регламента». Не выдумывай текущий код, схему, CI, статус Ubuntu.',
 'План должен включать серверные и мобильные проверки и проверку Ubuntu, если затронут релиз или офлайн.',
 'Пользователь может формулировать идею глаголом «сделай/добавь/удали»; обсуждай предлагаемую функцию, не исполняй команду.',
].join('\n');

export function usdDesignRuleTopic(query:string):string|null{
 if(/bassrace|бас.?рейс/i.test(query))return 'bassrace';
 if(/инспекц|допуск|провер.*машин/i.test(query))return 'inspection';
 if(/регистрац|стартов.*номер/i.test(query))return 'registration';
 if(/суд|замер|результат|места|протокол/i.test(query))return 'results';
 if(/конфигурац|класс|сабвуфер|усилител/i.test(query))return 'configurations';
 if(/правил|регламент/i.test(query))return 'all';
 return null;
}

/** Called strictly AFTER USD scope verification; never executes writes. */
export async function loadUsdDesignEvidence(input:{
 query:string;
 runTool:(name:UsdExpertTool,args:UsdToolArgs)=>Promise<unknown>;
 maxChars?:number;
}):Promise<{context:string;usedTools:UsdExpertTool[]}>{
 const maxChars=Math.max(300,Math.min(7800,Math.trunc(input.maxChars??5500)));
 const calls:Array<[UsdExpertTool,UsdToolArgs]>=[
  ['usd_project_docs',{query:input.query.slice(0,180),document:'all'}],
 ];
 const ruleTopic=usdDesignRuleTopic(input.query);
 if(ruleTopic)calls.push(['usd_rules',{topic:ruleTopic}]);
 const usedTools:UsdExpertTool[]=[];
 const snippets:string[]=[];
 for(const [name,args] of calls){
  try{
   const value=await input.runTool(name,args);
   let serialized=redactSourceText(JSON.stringify(value)||'');
   if(serialized.length>maxChars)serialized=serialized.slice(0,maxChars-120)+'… [фрагмент ограничен]';
   snippets.push(name+': '+serialized);
   usedTools.push(name);
  }catch{
   snippets.push(name+': источник временно недоступен');
  }
 }
 return {
  context:snippets.join('\n').slice(0,maxChars),
  usedTools,
 };
}
