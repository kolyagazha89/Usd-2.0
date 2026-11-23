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
