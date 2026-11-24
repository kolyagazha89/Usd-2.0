/** Deterministic commands are answered from the database, not guessed by a model.
 * Anything ambiguous remains conversational. Never interpret a write as a read-only task.
 */
export type AssistantIntent =
  | 'STAGE_READINESS' | 'DATA_QUALITY_SCAN' | 'IMPORT_DIAGNOSTICS'
  | 'SYSTEM_SNAPSHOT' | 'ATTENTION' | 'JUDGING_HELP';

export type AssistantHistoryItem = { role: 'user' | 'assistant'; content: string };

export function isAssistantWriteRequest(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (/^(как|каким образом|подскажи|расскажи|где|можно ли|что делать|почему|проверь|покажи|найди|сколько|что требуется)/i.test(text)) return false;
  return /^(пожалуйста[,\s]+)?(измени|изменить|поменяй|поменять|исправь|исправить|добавь|добавить|удали|удалить|создай|создать|сделай|сделать|перенеси|перенести|отмени|отменить|включи|выключи|опубликуй|заблокируй|зарегистрируй|внеси|сохрани|отправь|настрой|реализуй|переделай)(?=\s|$|[,.!?:])/i.test(text);
}

export function classifyAssistantIntent(message: string): AssistantIntent | null {
  const text = message.trim().toLowerCase();
  if (!text || isAssistantWriteRequest(text)) return null;
  if (/(сколько.*(регистрац|участник|инспекц|результат).*этап|на.*этап.*(регистрац|инспекц|результат))/i.test(text)) return 'STAGE_READINESS';
  if (/(готовност[ьи].*этап|этап.*готов|проверь.*этап|текущ(ий|его|ем) этап|что с этапом)/i.test(text)) return 'STAGE_READINESS';
  if (/(что.*требует внимания|что.*не так|проблем.*сейчас|что.*проверить сейчас|какие.*проблем)/i.test(text)) return 'ATTENTION';
  if (/(импорт|загрузк.*(файл|данн)|предупрежден.*(импорт|загрузк)|синхронизац.*данн)/i.test(text)) return 'IMPORT_DIAGNOSTICS';
  if (/(качеств.*данн|ошибк.*данн|дубл.*(участник|профил|запис)|проверь.*ошибк)/i.test(text)) return 'DATA_QUALITY_SCAN';
  if (/(состояни.*систем|снимок.*систем|сколько.*(участник|машин|автомобил|результат|регистрац)|общ(ая|ую).*сводк|статистик.*систем)/i.test(text)) return 'SYSTEM_SNAPSHOT';
  if (/(как.*(инспекц|судейств|результат|класс|bassrace|бассрейс)|инструкц.*(суд|инспекц)|как.*поменять.*класс)/i.test(text)) return 'JUDGING_HELP';
  return null;
}

/** Drop forged system/developer roles and overlong content from browser input. */
export function normalizeAssistantHistory(value: unknown): AssistantHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    .filter((item) => (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
    .map((item) => ({ role: item.role as 'user' | 'assistant', content: String(item.content).trim() }))
    .filter((item) => item.content.length > 0 && item.content.length <= 1200)
    .slice(-8);
}


export type StageQuestion={selection?:'past'|'upcoming';kind:'report'|'classes'|'results'};

/** Recognise complete read-only questions, not isolated keywords. Unknown
 * clauses, named stages and write instructions are not silently reinterpreted. */
export function normalizeOperationalQuestion(message:string):string{
 return message.toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim()
  .replace(/^(?:(?:ну|бро|ии|ассистент|usd|юсд|пожалуйста|подскажи|скажи|расскажи|а)[,\s:]+)+/,'')
  .replace(/[?!.]+$/,'').trim();
}
const stageReference='(?:последн(?:ий|его|ем|ему|им)|прошедш(?:ий|его|ем|ему|им)|предыдущ(?:ий|его|ем|ему|им)|прошл(?:ый|ого|ом|ому|ым)|ближайш(?:ий|его|ем|ему|им)|следующ(?:ий|его|ем|ему|им)|предстоящ(?:ий|его|ем|ему|им)|текущ(?:ий|его|ем|ему|им)|эт(?:от|ом|ому|им|ого)|выбранн(?:ый|ого|ом|ому|ым))';
const stage=stageReference+' этап(?:а|у|е|ом)?';
const stageContext='(?:(?:на|по|за|с|у) )?(?:'+stage+'|этап(?:а|у|е|ом)?)';
const counts='(?:участников|человек|людей|народу|регистраций|заявок|машин|автомобилей|результатов|инспекций|классов)';
const registered='(?:зарегано|зарегалось|зарегистрировано|зарегистрировалось|записалось|заявилось|подали заявки)';
const reportPatterns=[
 '^(?:(?:дай|покажи|сформируй|сделай|выведи) )?(?:отчет|сводку|статистику|информацию) '+stageContext+'$',
 '^(?:(?:как дела|как там дела|что там|че там|че|что|как обстоят дела|какая ситуация|какие новости|какой статус|какие итоги|как все) (?:по|с|на|у) '+stage+'|как (?:прошел|проходит|готовится) '+stage+'|'+stage+' (?:как прошел|как дела|готов ли|готовность)|проверь (?:готовность )?'+stageContext+')$',
 '^(?:когда|где)(?: будет| пройдет| состоится| прошел)? '+stage+'$',
 '^(?:сколько|скока) (?:(?:'+counts+'(?: '+registered+')?|'+registered+'(?: '+counts+')?) '+stageContext+'|'+stageContext+' (?:'+counts+'|'+registered+'(?: '+counts+')?)|'+counts+' '+stageContext+' '+registered+')$',
].map(pattern=>new RegExp(pattern));
function stageSelection(text:string):StageQuestion['selection']{
 if(/последн|прошедш|предыдущ|прошл/.test(text))return 'past';
 if(/ближайш|следующ|предстоящ/.test(text))return 'upcoming';
 return undefined;
}
export function classifyStageQuestion(message:string,history?:unknown):StageQuestion|null{
 const text=normalizeOperationalQuestion(message);
 if(text.length>220)return null;
 if(reportPatterns.some(pattern=>pattern.test(text)))return {kind:'report',selection:stageSelection(text)};
 if(/^(?:как прошел|какие итоги|что было на) (?:этап|этапе)$/.test(text))return {kind:'report',selection:'past'};
 if(new RegExp('^(?:какие|какие есть|список|покажи) классы(?: доступны| подключены| есть)? '+stageContext+'$').test(text)){
  return {kind:'classes',selection:stageSelection(text)};
 }
 if(new RegExp('^(?:(?:покажи |дай )?(?:результаты|итоги|победителей|протокол) '+stageContext+'|кто (?:выиграл|победил) '+stageContext+')$').test(text)){
  return {kind:'results',selection:stageSelection(text)};
 }
 // Inherit context only from the immediately previous user question, never a
 // model-generated claim or a caller-supplied system message.
 if(new RegExp('^(?:сколько|скока) (?:'+counts+'(?: '+registered+')?|'+registered+')$').test(text)){
  const last=normalizeAssistantHistory(history).filter(item=>item.role==='user').slice(-1)[0];
  const prior=last?classifyStageQuestion(last.content):null;
  if(prior)return {kind:'report',selection:prior.selection};
 }
 return null;
}
