import { isValidInternationalPhone, isValidRegistrationPlate } from './profile-validation';

describe('isValidInternationalPhone', () => {
  it.each([
    '+7 999 123-45-67',
    '+1 (415) 555-2671',
    '+44 7911 123456',
    '+31 6 12345678',
    '+49 151 23456789',
    '+91 9876543210',
    '+375 29 123-45-67',
    '+47 41234567',
    '+372 5123456',
    '+976 99112233',
  ])('accepts a plausible international number: %s', (phone) => {
    expect(isValidInternationalPhone(phone)).toBe(true);
  });

  it.each([
    '89991234567',
    '+999 12345678',
    '+1 123',
    '+7 111 111-11-11',
    'call me',
    '+7 +9991234567',
    '+7 999 12abc',
    '+375 29 1234',
    '+47 4123456',
    '+976 9911223',
  ])('rejects malformed or implausible input: %s', (phone) => {
    expect(isValidInternationalPhone(phone)).toBe(false);
  });

  it('allows an empty optional phone field', () => {
    expect(isValidInternationalPhone('')).toBe(true);
  });
});

describe('isValidRegistrationPlate', () => {
  it.each([
    ['RU', 'A123BC72'],
    ['RU', 'A123BC102'],
    // New regional codes must not be rejected by the server.
    ['RU', 'А123ВС80'],
    ['RU', 'А123ВС180'],
    ['RU', 'А123ВС81'],
    ['RU', 'А123ВС181'],
    ['RU', 'А123ВС82'],
    ['RU', 'А123ВС182'],
    ['RU', 'А123ВС84'],
    ['RU', 'А123ВС184'],
    ['RU', 'А123ВС85'],
    ['RU', 'А123ВС185'],
    ['NO', 'AB12345'],
    ['FI', 'ABC-123'],
    ['EE', '123ABC'],
    ['LV', 'AB-1234'],
    ['LT', 'ABC-123'],
    ['PL', 'WA12345'],
    ['BY', '1234AB-7'],
    ['UA', 'AA1234BB'],
    ['GE', 'AB-123-CD'],
    ['AZ', '10-AA-123'],
    ['KZ', '123ABC01'],
    ['CN', 'A1B2345'],
    ['MN', '1234AB'],
    ['KP', 'ABC-123'],
    ['US', 'ABC1234'],
  ])('accepts a supported country plate (%s): %s', (country, plate) => {
    expect(isValidRegistrationPlate(country, plate)).toBe(true);
  });

  it.each([
    ['RU', 'NOT A PLATE'],
    ['RU', 'A123BC00'],
    ['RU', 'A123BC100'],
    ['NO', 'A12345'],
    ['FI', '123-ABC'],
    ['EE', 'ABC123'],
    ['LV', '1A-1234'],
    ['LT', 'AB-12'],
    ['PL', '!!!'],
    ['BY', 'ABC123'],
    ['UA', 'AA12BB'],
    ['GE', '123-AB-CD'],
    ['AZ', 'A1-AA-123'],
    ['KZ', 'ABC123'],
    ['CN', '123456'],
    ['MN', 'AB1234'],
    ['KP', '!!!!!!!!!!!!'],
    ['US', '!!!!!!!!'],
  ])('rejects malformed plate (%s): %s', (country, plate) => {
    expect(isValidRegistrationPlate(country, plate)).toBe(false);
  });

  it('accepts the structural 2026 codes and 1–9 regional prefixes without a stale region whitelist', () => {
    for (const region of ['20','147','155','166','193','198','224','250','252','323','550','778','997']) {
      expect(isValidRegistrationPlate('RU','У623РН'+region)).toBe(true);
    }
    for (let base=1; base<=99; base++) {
      const suffix=String(base).padStart(2,'0');
      for (const prefix of ['',...'123456789']) {
        expect(isValidRegistrationPlate('RU','А123ВС'+prefix+suffix)).toBe(true);
      }
    }
    for (const region of ['00','000','001','100','200','900']) {
      expect(isValidRegistrationPlate('RU','А123ВС'+region)).toBe(false);
    }
  });

  it('normalizes pasted separators and Latin lookalikes before matching Russian codes', () => {
    for (const plate of ['Y623PH193','У 623 РН-193','У623РН|193','у623рн193']) {
      expect(isValidRegistrationPlate('RU',plate)).toBe(true);
    }
    expect(isValidRegistrationPlate('RU','Д623ЯЯ193')).toBe(false);
    expect(isValidRegistrationPlate('RU','У623РН1934')).toBe(false);
  });

  it('rejects unknown countries and empty plates', () => {
    expect(isValidRegistrationPlate('XX', 'ABC123')).toBe(false);
    expect(isValidRegistrationPlate('RU', '')).toBe(false);
  });
});


describe('Russian registration plate normalization', () => {
  it('accepts a separator accidentally pasted into the region', () => {
    expect(isValidRegistrationPlate('RU', 'е666ее|66')).toBe(true);
  });
  it('accepts Latin lookalikes and separators in Russian plates', () => {
    expect(isValidRegistrationPlate('RU', 'E666EE-66')).toBe(true);
  });
});
