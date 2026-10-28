/** Parse USD QR links without treating the permanent ID as an authentication token. */
export type InspectionQr =
  | { kind: 'registration'; stageId: string; registrationId: string }
  | { kind: 'usd-id'; token: string };

export function parseInspectionQr(raw: string, origin: string): InspectionQr {
  const url = new URL(raw.trim(), origin);
  if (url.origin !== origin) throw new Error('QR-код должен вести на текущий сайт USD');
  const id = /^\/usd-id\/([a-f0-9]{48})$/.exec(url.pathname);
  if (id) return { kind: 'usd-id', token: id[1] };
  if (url.pathname !== '/admin/inspections') throw new Error('Это не QR-код USD');
  const stageId = url.searchParams.get('stageId') || '';
  const registrationId = url.searchParams.get('registrationId') || '';
  if (!stageId || !registrationId) throw new Error('В QR-коде нет этапа или регистрации');
  return { kind: 'registration', stageId, registrationId };
}
