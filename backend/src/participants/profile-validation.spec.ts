import { isValidInternationalPhone, isValidRegistrationPlate } from './profile-validation';

describe('isValidInternationalPhone', () => {
  it.each([
    '+7 999 123-45-67',
    '+1 (415) 555-2671',
    '+44 7911 123456',
    '+31 6 12345678',
    '+49 151 23456789',
    '+91 9876543210',
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
  ])('rejects malformed or implausible input: %s', (phone) => {
    expect(isValidInternationalPhone(phone)).toBe(false);
  });

  it('allows an empty optional phone field', () => {
    expect(isValidInternationalPhone('')).toBe(true);
  });
});

describe('isValidRegistrationPlate', () => {
  it.each([
    ['RU', 'A123BC72'],\n    ['RU', 'A123BC102'],
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
    ['RU', 'NOT A PLATE'],\n    ['RU', 'A123BC00'],\n    ['RU', 'A123BC100'],
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

  it('rejects unknown countries and empty plates', () => {
    expect(isValidRegistrationPlate('XX', 'ABC123')).toBe(false);
    expect(isValidRegistrationPlate('RU', '')).toBe(false);
  });
});
