/** Only operational information that requires a registered entrant to change travel plans. */
export type CriticalStageKey = 'date' | 'startTimeMsk' | 'city' | 'venue' | 'address' | 'cancelled';
export type CriticalStageSnapshot = Record<CriticalStageKey, string | boolean>;

export const CRITICAL_STAGE_LABELS: Record<CriticalStageKey, string> = {
  date: 'дата проведения',
  startTimeMsk: 'время начала (МСК)',
  city: 'город',
  venue: 'площадка',
  address: 'адрес площадки',
  cancelled: 'отмена этапа',
};

export function criticalStageSnapshot(stage: Record<string, any>): CriticalStageSnapshot {
  const calendarDate = stage.date instanceof Date ? stage.date : new Date(stage.date);
  return {
    date: Number.isFinite(calendarDate.getTime()) ? calendarDate.toISOString().slice(0, 10) : '',
    startTimeMsk: String(stage.startTimeMsk ?? '10:00').trim() || '10:00',
    city: String(stage.city ?? '').trim().replace(/\\s+/g, ' '),
    venue: String(stage.venue ?? '').trim().replace(/\\s+/g, ' '),
    address: String(stage.address ?? '').trim().replace(/\\s+/g, ' '),
    cancelled: stage.status === 'CANCELLED',
  };
}

export function criticalStageChanges(before: CriticalStageSnapshot, after: CriticalStageSnapshot): CriticalStageKey[] {
  return (Object.keys(CRITICAL_STAGE_LABELS) as CriticalStageKey[]).filter(key => before[key] !== after[key]);
}
