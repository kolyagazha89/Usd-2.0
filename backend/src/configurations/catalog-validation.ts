import { BadRequestException } from '@nestjs/common';

/** Catalog suggestions are optional. Enforce valid names, physical group and
 * trustworthy catalog IDs independently of the React form. */
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

/** Only an unchanged historical row can keep a retired catalog ID; free-text
 * names are always allowed without an ID. The legacy exception is a multiset. */
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
      // The catalog is an optional autocomplete source: brand and model are
      // persisted on the configuration itself and need not be published.
      const brand = typeof row.brand === 'string' ? row.brand.trim() : '';
      const model = typeof row.model === 'string' ? row.model.trim() : '';
      if (!brand || !model || brand.length > 100 || model.length > 160) {
        throw new BadRequestException('Укажите марку (до 100 символов) и модель (до 160 символов) оборудования.');
      }
      // The physical equipment kind remains authoritative even for free text.
      if ((group === 'headUnits' && row.type && row.type !== 'HEAD_UNIT') ||
          (group === 'amplifiers' && row.type && row.type !== 'AMPLIFIER') ||
          (group === 'audioComponents' && (row.type === 'HEAD_UNIT' || row.type === 'AMPLIFIER'))) {
        throw new BadRequestException('Тип оборудования не соответствует разделу конфигурации.');
      }
      const id = String(row.catalogEntryId ?? '').trim();
      // No ID means manual text. This neither creates a catalog record nor
      // links the saved configuration to any other model.
      if (!id) continue;
      const category = categoryFor(group, row);
      const approved = models.some(entry =>
        entry.id === id && entry.category === category && entry.isActive !== false
        && normalize(entry.brand) === normalize(brand)
        && normalize(entry.model) === normalize(model),
      );
      if (approved) continue;
      // Historical inactive catalog IDs may survive on an unchanged row.
      const key = legacyKey(group, row);
      const remaining = legacy.get(key) ?? 0;
      if (remaining > 0) {
        legacy.set(key, remaining - 1);
        continue;
      }
      throw new BadRequestException(
        'Указанный ID справочника не соответствует модели «'
        + model.slice(0, 100) + '». Уберите ID при свободном вводе.',
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
