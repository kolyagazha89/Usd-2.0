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

  it.each([
    ['Blazhko Nokolay', 'Блажко Николай'],
    ['Golubnyak Anatooly', 'Голубняк Анатолий'],
    ['Zhidkov Yryi', 'Жидков Юрий'],
    ['Kudryashov Egor', 'Кудряшов Егор'],
    ['Mirzabekyan Lavrenty', 'Мирзабекян Лаврентий'],
    ['Musharsky Igor', 'Мушарский Игорь'],
    ['Musharskiy Igor', 'Мушарский Игорь'],
    ['Ovchinnikov Srgey', 'Овчинников Сергей'],
    ['Sergushin Terenty', 'Сергушин Терентий'],
    ['Chayka Yaroslav', 'Чайка Ярослав'],
    ['Chaika Yaroslav', 'Чайка Ярослав'],
  ])('never produces mangled Russian endings from Latin Results: %s', (raw, expected) => {
    expect(service.normalize(raw)).toBe(expected);
    expect(service.inspect(raw).needsReview).toBe(false);
  });

  it.each([
    ['Блажко Ноколаы', 'Блажко Николай'],
    ['Голубняк Анатоолы', 'Голубняк Анатолий'],
    ['Жидков Йрыи', 'Жидков Юрий'],
    ['Кудряшов Эгор', 'Кудряшов Егор'],
    ['Мирзабекян Лавренты', 'Мирзабекян Лаврентий'],
    ['Мушарскиы Игорь', 'Мушарский Игорь'],
    ['Овчинников Сргеы', 'Овчинников Сергей'],
    ['Сергушин Терентиы', 'Сергушин Терентий'],
    ['Чаыка Ярослав', 'Чайка Ярослав'],
  ])('proposes exact verified repairs for previous mangled Cyrillic display %s', (raw, expected) => {
    expect(service.normalize(raw)).toBe(expected);
    expect(service.inspect(raw).needsReview).toBe(false);
    expect(service.normalize(expected)).toBe(expected);
  });

  it('flags a new unknown mistransliterated given name instead of creating a malformed person', () => {
    expect(service.inspect('Петров Иваны').needsReview).toBe(true);
    expect(service.inspect('Петров Иваны').reasons.some((reason) =>
      reason.includes('Подозрительное окончание'))).toBe(true);
  });

  it.each([
    'Агеенко Александр', 'Анташвили Тимур', 'Антоненко Артем',
    'Апухтин Александр', 'Байбеков Арсен', 'Бакулев Артем',
    'Белов Егор', 'Блажко Николай', 'Бочаров Виталий',
    'Бруднов Алексей', 'Булатов Константин', 'Бурдин Алексей',
    'Бушкин Дмитрий', 'Василенко Ксения', 'Василиев Андрей',
    'Воитов Владимир', 'Войтенко Евгений', 'Волков Артём',
    'Воробьев Андрей', 'Воробьев Иван', 'Гажа Николай',
    'Галушкин Александр', 'Ганс Ричард', 'Ганшмидт Евгений',
    'Говорухин Илья', 'Голубняк Анатолий', 'Даков Олег',
    'Джаббаров Роман', 'Докторов Андрей', 'Дубровин Илья',
    'Жидков Юрий', 'Захаров Антон', 'Зацепилов Кирилл',
    'Земсков Дмитрий', 'Зинченко Михаил', 'Зубарев Владислав',
    'Зуборев Владислав', 'Иванов Александр', 'Иванов Иван',
    'Исаев Евгений', 'Каменщиков Павел', 'Камынин Вячеслав',
    'Каргин Андрей', 'Карпенко Кирилл', 'Климов Виктор',
    'Колыхайло Денис', 'Кононов Сергей', 'Корандо Андрей',
    'Королев Даниил', 'Коршиков Денис', 'Кривоносов Александр',
    'Кудряшов Егор', 'Кузнецов Максим', 'Ладо Иван',
    'Лапшев Игорь', 'Латышева Ксения', 'Лютов Виктор',
    'Малышко Максим', 'Мамцев Роман', 'Меркулов Артем',
    'Мирзабекян Лаврентий', 'Морозов Денис', 'Муратбаев Аллаяр',
    'Мушарский Игорь', 'Никулин Максим', 'Овчинников Сергей',
    'Орлов Никита', 'Павлов Павел', 'Пастушин Денис',
    'Петров Иван', 'Пономарев Сергей', 'Потапов Александр',
    'Пучков Александр', 'Рысухин Никита', 'Сабельников Дмитрий',
    'Савин Алексей', 'Салагубов Даниил', 'Саломатин Вадим',
    'Сапрыкин Вадим', 'Сауляк Валерий', 'Сергушин Терентий',
    'Сигаев Павел', 'Смирнов Александр', 'Смолиянинов Валентин',
    'Соколов Алексей', 'Телпов Анатолий', 'Теплов Владислав',
    'Тимохин Александр', 'Туманов Никита', 'Урих Александр',
    'Фёдоров Роман', 'Харитонов Даниил', 'Харков Виталий',
    'Холодилин Иван', 'Чамин Никита', 'Чайка Ярослав',
    'Чернов Андрей', 'Чуреев Валентин', 'Шилов Сергей',
    'Ширшов Александр', 'Шкрилев Владислав', 'Шувалов Назар',
    'Шульгин Эдуард', 'Яковлев Максим',
  ])('keeps already-correct Cyrillic FIO unchanged across repeated normalization: %s', (raw) => {
    expect(service.normalize(raw)).toBe(raw);
    expect(service.normalize(service.normalize(raw))).toBe(raw);
    expect(service.inspect(raw).needsReview).toBe(false);
  });

  it.each([
    ['Мухарскиы Игорь', 'Мухарский Игорь'],
    ['Muharskiy Igor', 'Мухарский Игорь'],
    ['Muharsky Igor', 'Мухарский Игорь'],
    ['Mukharskiy Igor', 'Мухарский Игорь'],
    ['Mukharsky Igor', 'Мухарский Игорь'],
    ['Musharsky Igor', 'Мушарский Игорь'],
    ['Мушарскиы Игорь', 'Мушарский Игорь'],
  ])('keeps Mushar/Mukhar surname identities separate while fixing broken endings: %s', (raw, expected) => {
    expect(service.normalize(raw)).toBe(expected);
    expect(service.inspect(raw).needsReview).toBe(false);
  });

  it('never joins an unverified Mukharskiy and Musharskiy just because the names look similar', () => {
    const mukhar = service.normalizeForMatching('Мухарскиы Игорь');
    const mushar = service.normalizeForMatching('Мушарскиы Игорь');
    expect(mukhar).toBe('мухарский игорь');
    expect(mushar).toBe('мушарский игорь');
    expect(mukhar).not.toBe(mushar);
  });

  it('blocks any unknown corrupted Russian surname ending -скиы before participant creation', () => {
    const inspection = service.inspect('Незнакомскиы Игорь');
    expect(inspection.needsReview).toBe(true);
    expect(inspection.reasons).toContain(
      'Подозрительное окончание фамилии после транслитерации: проверьте исходное написание',
    );
  });

  it('never merges genuine distinct surname variants merely by their similarity', () => {
    expect(service.normalizeForMatching('Зубарев Владислав')).not.toBe(
      service.normalizeForMatching('Зуборев Владислав'));
    expect(service.normalizeForMatching('Василенко Ксения')).not.toBe(
      service.normalizeForMatching('Василрнко Ксения'));
    expect(service.inspect('34 Sound').needsReview).toBe(true);
    expect(service.inspect('Aleksey SF').needsReview).toBe(true);
    expect(service.inspect('Antoha SF').needsReview).toBe(true);
    expect(service.inspect('Bass Market').needsReview).toBe(true);
    expect(service.inspect('Maks SF').needsReview).toBe(true);
  });

});
