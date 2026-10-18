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
  it.each([
    ['Teplov Vladislav', 'Теплов Владислав'],
    ['Voitenko Evgeny', 'Войтенко Евгений'],
    ['Vorobiev Ivan', 'Воробьев Иван'],
    ['Misheryakov Sergey', 'Мещеряков Сергей'],
    ['Golubnyak Anatoliy', 'Голубняк Анатолий'],
  ])('transliterates Latin words with the library: %s', (raw, normalized) => {
    expect(service.normalize(raw)).toBe(normalized);
  });

  it.each([
    ['Говорухин Илийа', 'Говорухин Илья'],
    ['Голубняк Анатоолй', 'Голубняк Анатолий'],
    ['Жидков Йры', 'Жидков Юрий'],
    ['Блажко Ноколай', 'Блажко Николай'],
    ['Овчинников Сргей', 'Овчинников Сергей'],
    ['Мирзабекян Лаврентй', 'Мирзабекян Лаврентий'],
    ['Булатов Костантин', 'Булатов Константин'],
  ])('corrects an explicitly known bad given name: %s', (raw, normalized) => {
    expect(service.normalize(raw)).toBe(normalized);
    expect(service.inspect(raw).needsReview).toBe(false);
  });

  it.each([
    '34 Соунд',
    'Антоха Сф',
    'Алексей Сф',
    'Басс Маркет',
    'Василрнко Ксения',
    'Каменсджиков Павел',
    'Зуборев Владислав',
    'Телпов Анатолий',
  ])('quarantines suspicious source names instead of creating fake participants: %s', (raw) => {
    expect(service.inspect(raw).needsReview).toBe(true);
    expect(service.inspect(raw).reasons.length).toBeGreaterThan(0);
  });

  it('does not automatically turn two distinct surname variants into one person', () => {
    expect(service.normalize('Зубарев Владислав')).not.toBe(
      service.normalize('Зуборев Владислав'),
    );
    expect(service.normalize('Василенко Ксения')).not.toBe(
      service.normalize('Василрнко Ксения'),
    );
  });

  it('uses a published implementation for Russian-to-Latin aliases without the handmade character map', () => {
    expect(service.toLatin('Теплов Владислав')).toContain('teplov');
    expect(service.toLatin('Войтенко Евгений')).toContain('voitenko');
  });

}
