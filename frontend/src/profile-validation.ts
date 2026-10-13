/**
 * Validation shared by the participant portal forms.
 * Phone numbers must be entered in international E.164 style (+country code).
 * Length/calling-code checks intentionally reject obvious garbage; they do not
 * claim to prove that a number is assigned or reachable.
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

export function isValidPlate(country: string, value: string): boolean {
  let number = value.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!number || number.length > 16) return false;
  // Russian plates use a fixed set of Cyrillic letters. Convert Latin lookalikes
  // before validation, then validate the whole number rather than a substring.
  if (country === 'RU') {
    const lookalikes: Record<string,string> = {A:'А',B:'В',E:'Е',K:'К',M:'М',H:'Н',O:'О',P:'Р',C:'С',T:'Т',Y:'У',X:'Х'};
    number = [...number].map(ch => lookalikes[ch] ?? ch).join('');
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
  return Boolean(patterns[country]?.test(number));
}
