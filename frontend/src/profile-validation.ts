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

const VALID_RUSSIAN_REGIONS = new Set(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49', '50', '51', '52', '53', '54', '55', '56', '57', '58', '59', '60', '61', '62', '63', '64', '65', '66', '67', '68', '69', '70', '71', '72', '73', '74', '75', '76', '77', '78', '79', '80', '81', '82', '83', '84', '85', '86', '87', '88', '89', '90', '91', '92', '93', '94', '95', '96', '97', '98', '99', '102', '113', '116', '121', '123', '124', '125', '126', '134', '136', '138', '142', '150', '152', '154', '159', '161', '163', '164', '173', '174', '177', '178', '186', '190', '196', '197', '199', '702', '716', '725', '750', '754', '761', '763', '774', '777', '790', '797', '799', '977']);

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
  if (!patterns[country]?.test(number)) return false;
  if (country === 'RU') {
    const region = number.match(/(\\d{2,3})$/)?.[1];
    if (!region || !VALID_RUSSIAN_REGIONS.has(region)) return false;
  }
  return true;
}
