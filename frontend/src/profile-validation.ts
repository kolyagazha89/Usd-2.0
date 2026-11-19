import { AsYouType } from 'libphonenumber-js';

/**
 * Validation shared by participant portal forms.
 * Phone numbers are accepted only when libphonenumber-js recognizes a valid
 * international number; reachability is not inferred from format validation.
 */
import { isValidPhoneNumber } from 'libphonenumber-js';

export function isValidInternationalPhone(value: string): boolean {
  const phone = value.trim();
  if (!phone) return true;
  if (!phone.startsWith('+')) return false;
  try {
    return isValidPhoneNumber(phone);
  } catch {
    return false;
  }
}

// A two-digit Russian region code is 01–99. For type-1 plates, МВД
// Order 766 permits prefixing it with a digit 1–9 (e.g. 93 -> 193; 23 -> 323).
// Validate the structure, not a manually curated list of issued series:
// that list quickly becomes obsolete and blocks legitimate car registrations.
function isValidRussianRegionCode(region: string): boolean {
  return /^([0-9]{2}|[1-9][0-9]{2})$/.test(region) && !region.endsWith('00');
}

export function isValidPlate(country: string, value: string): boolean {
  let number = value.normalize('NFKC').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!number || number.length > 16) return false;
  // Russian plates use a fixed set of Cyrillic letters. Convert Latin lookalikes
  // before validation, then validate the whole number rather than a substring.
  if (country === 'RU') {
    const lookalikes: Record<string,string> = {A:'А',B:'В',E:'Е',K:'К',M:'М',H:'Н',O:'О',P:'Р',C:'С',T:'Т',Y:'У',X:'Х'};
    number = [...number].map(ch => /[|\s.\-_/\\]/.test(ch) ? '' : (lookalikes[ch] ?? ch)).join('');
  }
  const patterns: Record<string,RegExp> = {
    RU:/^[АВЕКМНОРСТУХ]\d{3}[АВЕКМНОРСТУХ]{2}\d{2,3}$/,
    NO:/^[A-Z]{2} ?\d{5}$/,
    FI:/^[A-Z]{2,3}-?\d{1,3}$/,
    EE:/^\d{3} ?[A-Z]{3}$/,
    LV:/^[A-Z]{2}-?\d{1,4}$/,
    LT:/^[A-Z]{3}-?\d{3}$/,
    PL:/^[A-Z]{1,3}[A-Z0-9]{4,7}$/,
    BY:/^\d{4} ?[A-Z]{2}-?\d{1,2}$/,
    UA:/^[A-Z]{2} ?\d{4} ?[A-Z]{2}$/,
    GE:/^[A-Z]{2}-?\d{3}-?[A-Z]{2}$/,
    AZ:/^\d{2}-?[A-Z]{2}-?\d{3}$/,
    KZ:/^\d{3} ?[A-Z]{1,3} ?\d{2,3}$/,
    CN:/^[A-Z][A-Z0-9] ?[A-Z0-9]{5}$/,
    MN:/^\d{4} ?[A-Z]{2,3}$/,
    KP:/^(?=.*[A-Z0-9])[A-Z0-9 -]{3,10}$/,
    // US formats are state-specific; reject punctuation and enforce 2–8 chars.
    US:/^[A-Z0-9][A-Z0-9 -]{1,7}$/
  };
  if (!patterns[country]?.test(number)) return false;
  if (country === 'RU') {
    const region = number.match(/(\d{2,3})$/)?.[1];
    if (!region || !isValidRussianRegionCode(region)) return false;
  }
  return true;
}

/** Live input mask. Russian plates follow A000AA00 (optional third region digit); invalid characters are discarded by position. */
export function formatPlateInput(country: string, value: string): string {
  let raw = String(value ?? '').toUpperCase().replace(/\s+/g, '');
  if (country !== 'RU') return raw.replace(/[^A-Z0-9-]/g, '').slice(0, 10);
  const lookalikes: Record<string,string> = {A:'А',B:'В',E:'Е',K:'К',M:'М',H:'Н',O:'О',P:'Р',C:'С',T:'Т',Y:'У',X:'Х'};
  raw = [...raw].map(ch => lookalikes[ch] ?? ch).join('');
  const letters = new Set('АВЕКМНОРСТУХ');
  let out = '';
  for (const ch of raw) {
    const pos = out.length;
    if (pos === 0) { if (letters.has(ch)) out += ch; }
    else if (pos >= 1 && pos <= 3) { if (/\d/.test(ch)) out += ch; }
    else if (pos === 4 || pos === 5) { if (letters.has(ch)) out += ch; }
    else if (pos >= 6 && pos <= 8) { if (/\d/.test(ch)) out += ch; }
    if (out.length >= 9) break;
  }
  return out;
}

/** RU phone mask applied while typing, including incomplete values. */
export function formatRussianPhoneInput(value: string): string {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('8') || digits.startsWith('7')) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (!digits) return '';
  const a = digits.slice(0, 3), b = digits.slice(3, 6), c = digits.slice(6, 8), d = digits.slice(8, 10);
  return '+7' + (a ? ' (' + a + (a.length === 3 ? ')' : '') : '') + (b ? ' ' + b : '') + (c ? '-' + c : '') + (d ? '-' + d : '');
}

/**
 * Live international phone mask for generic admin forms.
 * Keep the exact RU mask users approved; for other countries use libphonenumber's
 * international formatter. Non-RU input must include + (the server requires it).
 */
export function formatPhoneInput(value: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  const isRussian = raw.startsWith('+7')
    || ((!raw.startsWith('+') || raw.startsWith('+7')) && (digits.startsWith('7') || digits.startsWith('8')) && digits.length <= 11);
  if (isRussian) return formatRussianPhoneInput(raw);

  // Keep only a single leading plus and digits; discard pasted names/punctuation.
  let international = raw.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  if (international.startsWith('00')) international = '+' + international.slice(2);
  if (!international.startsWith('+')) return formatRussianPhoneInput(raw);
  return new AsYouType().input(international).slice(0, 25);
}
