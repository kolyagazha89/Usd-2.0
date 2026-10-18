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
    expect(service.normalize('Пётр Королёв')).toBe('Пётр Королёв');
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
  ])('quarantines suspicious source names instead of creating fake participants: %s', (raw) => {
    expect(service.inspect(raw).needsReview).toBe(true);
    expect(service.inspect(raw).reasons.length).toBeGreaterThan(0);
  });

  it.each([
    ['Urih Alexandr', 'Урих Александр'],
    ['Haritonov Daniil', 'Харитонов Даниил'],
    ['Apuhtin Alexandr', 'Апухтин Александр'],
    ['Timohin Alexandr', 'Тимохин Александр'],
    ['Holodilin Ivan', 'Холодилин Иван'],
    ['Govoruhin Iliya', 'Говорухин Илья'],
    ['Harkov Vitaly', 'Харков Виталий'],
    ['Kolyhailo Denis', 'Колыхайло Денис'],
    ['Kamensjikov Pavel', 'Каменщиков Павел'],
    ['Mamcev Roman', 'Мамцев Роман'],
    ['Baibekov Arsen', 'Байбеков Арсен'],
    ['Zuborev Vladislav', 'Зуборев Владислав'],
    ['Telpov Anatoly', 'Телпов Анатолий'],
  ])('correctly transliterates the exact reported Latin name %s', (source, expected) => {
    expect(service.normalize(source)).toBe(expected);
    expect(service.inspect(source).needsReview).toBe(false);
    expect(service.inspect(source).normalized).not.toMatch(/[a-z]/i);
  });

  it.each([
    ['34 Sound', 'цифры/псевдоним'],
    ['Bass Market', 'псевдоним'],
    ['Aleksey SF', 'сокращённая фамилия'],
    ['Maks SF', 'сокращённая фамилия'],
    ['Antoha SF', 'псевдоним'],
    ['Vasilrnko Kseniya', 'неоднозначная фамилия'],
  ])('flags the actual ambiguous input %s (%s)', (source) => {
    expect(service.inspect(source).needsReview).toBe(true);
  });

  it('preserves actual Russian digraphs after lone-h conversion', () => {
    expect(service.normalize('Shcherbakov Ivan')).toBe('Щербаков Иван');
    expect(service.normalize('Churikov Pavel')).toBe('Чуриков Павел');
    expect(service.normalize('Zhukov Roman')).toBe('Жуков Роман');
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
});
