import { NameNormalizerService } from './name-normalizer.service';

describe('NameNormalizerService', () => {
  const service = new NameNormalizerService();

  it('normalizes repeated whitespace and Unicode compatibility characters', () => {
    expect(service.normalize('  Ｍｉｓｈｅｒｙａｋｏｖ　 Sergey  ')).toBe(
      'Мещеряков Сергей',
    );
  });

  it('treats commas and semicolons as name separators', () => {
    expect(service.normalize('Misheryakov, Sergey; Ivanovich')).toBe(
      'Мещеряков Сергей Иванович',
    );
  });

  it('matches known Latin transliteration variants to the same Russian spelling', () => {
    expect(service.normalize('Misheryakov Sergey')).toBe(
      service.normalize('Мещеряков Сергей'),
    );
    expect(service.normalize('Nikolay Ivanov')).toBe(
      'Николай Иванов',
    );
  });

  it('normalizes ё consistently for matching', () => {
    expect(service.normalize('Пётр Королёв')).toBe('Петр Королев');
    expect(service.normalizeForMatching('Пётр Королёв')).toBe(
      'петр королев',
    );
  });

  it('preserves hyphenated surnames while normalizing dash variants', () => {
    expect(service.normalize('Иванов—Петров Сергей')).toBe(
      'Иванов-Петров Сергей',
    );
  });

  it('returns an empty string for missing or whitespace-only input', () => {
    expect(service.normalize(null)).toBe('');
    expect(service.normalize(undefined)).toBe('');
    expect(service.normalize('   ')).toBe('');
  });
});
