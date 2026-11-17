/** Validate server PUSH-editor responses before publishing them to React state.
 * A failed API request or old test fixture must never blank the admin shell. */
export type PushTemplate = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  title: string;
  body: string;
};
export type PushTemplateResponse = { templates: PushTemplate[]; revision: string };

export function parsePushTemplateResponse(value: unknown): PushTemplateResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Некорректный ответ сервера PUSH. Обновите страницу после обновления API.');
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.revision !== 'string' ||
      !/^[a-f0-9]{64}$/.test(raw.revision) ||
      !Array.isArray(raw.templates) ||
      raw.templates.length === 0) {
    throw new Error('Сервер вернул неверный список шаблонов PUSH.');
  }
  const seen = new Set<string>();
  const templates = raw.templates.map((item: unknown): PushTemplate => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Некорректный шаблон PUSH.');
    }
    const row = item as Record<string, unknown>;
    if (typeof row.key !== 'string' || !row.key || seen.has(row.key) ||
        typeof row.label !== 'string' || typeof row.description !== 'string' ||
        typeof row.enabled !== 'boolean' || typeof row.title !== 'string' ||
        typeof row.body !== 'string') {
      throw new Error('Некорректный или повторный шаблон PUSH.');
    }
    seen.add(row.key);
    return {
      key: row.key,
      label: row.label,
      description: row.description,
      enabled: row.enabled,
      title: row.title,
      body: row.body,
    };
  });
  return { revision: raw.revision, templates };
}
