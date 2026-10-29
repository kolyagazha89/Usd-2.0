import { BadRequestException } from '@nestjs/common';

/** The public catalog lives in siteSettings.catalogs until the normalized tables ship.
 * This guard is intentionally independent of React: API callers cannot submit arbitrary
 * brand/model text, switch a subwoofer into a different category, or reuse a stale ID.
 */
export type CatalogEquipmentRow = {
  catalogEntryId?: string | null;
  brand: string;
  model: string;
  type?: string;
  direction?: string;
  quantity?: number;
};
export type CatalogEquipment = {
  headUnits?: CatalogEquipmentRow[];
  audioComponents?: CatalogEquipmentRow[];
  amplifiers?: CatalogEquipmentRow[];
  batteries?: CatalogEquipmentRow[];
};

type CatalogEntry = { id?: unknown; category?: unknown; brand?: unknown; model?: unknown; isActive?: unknown };
const normalize = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('ru');

function categoryFor(group: keyof CatalogEquipment, row: CatalogEquipmentRow): string {
  if (group === 'headUnits') return 'HEAD_UNIT';
  if (group === 'amplifiers') return 'AMPLIFIER';
  return row.type === 'SUBWOOFER' ? 'SUBWOOFER' : 'AUDIO_COMPONENT';
}

function legacyKey(group: keyof CatalogEquipment, row: CatalogEquipmentRow): string {
  return [group, categoryFor(group, row), normalize(row.brand), normalize(row.model),
    String(row.type ?? ''), String(row.direction ?? ''), String(row.quantity ?? ''),
    String(row.catalogEntryId ?? '').trim()].join('|');
}

/** Legacy imported equipment can be copied unchanged, but not duplicated, retagged
 * or modified without first choosing an approved catalog entry. This is a multiset
 * check so one existing row cannot authorize multiple new rows.
 */
export function assertCatalogEquipment(
  catalogs: unknown,
  submitted: CatalogEquipment,
  previous: CatalogEquipment = {},
): void {
  const raw = catalogs && typeof catalogs === 'object' && !Array.isArray(catalogs)
    ? (catalogs as { componentModels?: unknown }).componentModels : undefined;
  const models: CatalogEntry[] = Array.isArray(raw) ? raw : [];
  const batteryTypes = catalogs && typeof catalogs === 'object' && !Array.isArray(catalogs)
    ? (catalogs as { batteryTypes?: unknown }).batteryTypes : undefined;
  const approvedBatteries: Array<{code?:unknown;isActive?:unknown}> = Array.isArray(batteryTypes) ? batteryTypes : [];
  for (const group of ['headUnits', 'audioComponents', 'amplifiers'] as const) {
    const legacy = new Map<string, number>();
    for (const row of previous[group] ?? []) {
      const key = legacyKey(group, row);
      legacy.set(key, (legacy.get(key) ?? 0) + 1);
    }
    for (const row of submitted[group] ?? []) {
      const category = categoryFor(group, row);
      const id = String(row.catalogEntryId ?? '').trim();
      const approved = id && models.some(entry =>
        entry.id === id && entry.category === category && entry.isActive !== false
        && normalize(entry.brand) === normalize(row.brand)
        && normalize(entry.model) === normalize(row.model),
      );
      if (approved) continue;
      // A retired or removed catalog entry may survive unchanged in an existing
      // version. Its exact ID, category, direction and quantity must match a
      // trusted previous row. A missing/replaced ID is never a legacy bypass.
      const key = legacyKey(group, row);
      const remaining = legacy.get(key) ?? 0;
      if (remaining > 0) {
        legacy.set(key, remaining - 1);
        continue;
      }
      throw new BadRequestException(
        'Модель «' + String(row.model ?? '').slice(0, 100)
        + '» отсутствует в опубликованном каталоге USD для категории ' + category
        + '. Выберите модель из справочника или отправьте заявку администратору.',
      );
    }
  }
  // Battery chemistry/construction is CMS-controlled too. A previously imported
  // battery can be retained verbatim, but a new battery must use an active code.
  const legacyBatteries = new Map<string, number>();
  const batteryKey = (row: CatalogEquipmentRow) =>
    [normalize(row.brand), normalize(row.model), String(row.quantity ?? '')].join('|');
  for (const row of previous.batteries ?? []) {
    const key = batteryKey(row);
    legacyBatteries.set(key, (legacyBatteries.get(key) ?? 0) + 1);
  }
  for (const row of submitted.batteries ?? []) {
    if (approvedBatteries.some(entry => entry.code === row.brand && entry.isActive !== false)) continue;
    const key = batteryKey(row), remaining = legacyBatteries.get(key) ?? 0;
    if (remaining > 0) {
      legacyBatteries.set(key, remaining - 1);
      continue;
    }
    throw new BadRequestException('Тип аккумулятора отсутствует в активном справочнике USD. Выберите доступный тип.');
  }
}
