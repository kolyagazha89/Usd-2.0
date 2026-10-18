import { Injectable } from '@nestjs/common';
import CyrillicToTranslit from 'cyrillic-to-translit-js';

export type NameInspection = {
  original: string;
  normalized: string;
  needsReview: boolean;
  reasons: string[];
};

/**
 * Latin -> Cyrillic transliteration is handled by a published library,
 * NOT our previous character-by-character converter. This is a spelling
 * operation, NOT an identity decision or a guess about a person's surname.
 */
@Injectable()
export class NameNormalizerService {
  private readonly transliterator = CyrillicToTranslit({ preset: 'ru' });

  // Exceptions needed because standard transliteration is lossy and English
  // spellings of Russian given names are not one-to-one. No fuzzy replacement
  // of family names or unrelated Participant IDs is permitted.
  private readonly latinExceptions: Readonly<Record<string, string>> = {
    zubanov: 'Зубанов',
    ivanov: 'Иванов',
    wassily: 'Василий',
    viktor: 'Виктор',
    mihail: 'Михаил',
    shulgin: 'Шульгин',
    ismagulov: 'Исмагулов',
    beksan: 'Бексан',
    tomashevskaya: 'Томашевская',
    irina: 'Ирина',
    kiyakov: 'Кияков',
    shakir: 'Шакир',
    karpov: 'Карпов',
    babashov: 'Бабашов',
    tambovcev: 'Тамбовцев',
    afanasiev: 'Афанасьев',
    dzhanhotov: 'Джанхотов',
    muslim: 'Муслим',
    mursalimov: 'Мурсалимов',
    gaidarov: 'Гейдаров',
    husein: 'Хусейн',
    hussein: 'Хусейн',
    tatarinov: 'Татаринов',
    sabelnikov: 'Сабельников',
    lazarev: 'Лазарев',
    goryachev: 'Горячев',
    makarevich: 'Макаревич',
    bakulev: 'Бакулев',
    dubkov: 'Дубков',
    rusik: 'Русик',
    matveev: 'Матвеев',
    zaharov: 'Захаров',
    latysheva: 'Латышева',
    andrey: 'Андрей',
    // Real-world simplified spellings with Latin h/j/c or a nonstandard y.
    // Keep these precise documented spellings rather than guessing names
    // from unsupported letters inside the library.
    kamensjikov: 'Каменщиков',
    kolyhailo: 'Колыхайло',
    kolyhailo: 'Колыхайло',
    mamcev: 'Мамцев',
    baibekov: 'Байбеков',
    misheryakov: 'Мещеряков', korolev: 'Королев',
    lyutov: 'Лютов', lytov: 'Лютов',
    zemskov: 'Земсков', isaev: 'Исаев',
    krivonosov: 'Кривоносов',
    lapshev: 'Лапшев', laptev: 'Лаптев',
    kamenshchikov: 'Каменщиков', kamenshikov: 'Каменщиков',
    kamynin: 'Камынин', mokhov: 'Мохов', kosolapov: 'Косолапов',
    krasnov: 'Краснов', kashapov: 'Кашапов',
    karekkikh: 'Карекких', usolcev: 'Усольцев', usoltsev: 'Усольцев',
    yakovenko: 'Яковенко', kholodilin: 'Холодилин',
    ryshuhin: 'Рысухин', rysuhin: 'Рысухин',
    shushpannikv: 'Шушпанников', shushpannikov: 'Шушпанников',
    voitenko: 'Войтенко', voytenko: 'Войтенко',
    vorobiev: 'Воробьев', vorobyev: 'Воробьев',
    teplov: 'Теплов', mikhail: 'Михаил',
    zacepilov: 'Зацепилов',
    daniil: 'Даниил', danil: 'Данил', dmitry: 'Дмитрий', dmitriy: 'Дмитрий',
    yury: 'Юрий', yuri: 'Юрий', yuriy: 'Юрий', yurii: 'Юрий',
    nikolai: 'Николай', nikolay: 'Николай',
    aleksandr: 'Александр', alexandr: 'Александр',
    alexander: 'Александр', aleksander: 'Александр',
    aleksey: 'Алексей', alexey: 'Алексей', alexei: 'Алексей',
    vitaly: 'Виталий', vitaliy: 'Виталий',
    anatoliy: 'Анатолий', anatoly: 'Анатолий', anatolii: 'Анатолий',
    kostantin: 'Константин', konstantin: 'Константин',
    ilya: 'Илья', ilia: 'Илья', iliya: 'Илья',
    lavrentiy: 'Лаврентий',
    yevgeny: 'Евгений', evgeny: 'Евгений', evgeniy: 'Евгений',
    sergey: 'Сергей', sergei: 'Сергей', sergiy: 'Сергей',
    kseniya: 'Ксения', ksenia: 'Ксения',
    artem: 'Артем', artyom: 'Артем',
    timur: 'Тимур', roman: 'Роман', nikita: 'Никита',
    vadim: 'Вадим', igor: 'Игорь', kirill: 'Кирилл',
    ivan: 'Иван', pavel: 'Павел', anton: 'Антон',
    maksim: 'Максим', maxim: 'Максим', vladislav: 'Владислав',
    valery: 'Валерий', valeriy: 'Валерий',
    vasiliy: 'Василий', vasily: 'Василий',
    vasili: 'Василий', vasilii: 'Василий', vassily: 'Василий',
    vyacheslav: 'Вячеслав', eduard: 'Эдуард',
    arman: 'Армен', armen: 'Армен',
    allayar: 'Аллаяр', shamil: 'Шамиль',
    ramil: 'Рамиль', ruslan: 'Руслан',
  };

  // Explicit, confirmed malformed GIVEN NAMES from the supplied historical
  // import report. Never silently "correct" surnames by edit distance.
  private readonly knownGivenNameCorrections: Readonly<Record<string, string>> = {
    'илийа': 'Илья', 'анатоолй': 'Анатолий',
    'анатолй': 'Анатолий', 'ноколай': 'Николай',
    'сргей': 'Сергей', 'йры': 'Юрий',
    'костантин': 'Константин', 'лаврентй': 'Лаврентий',
  };

  private readonly invalidPersonTokens = new Set([
    'сф', 'sound', 'соунд', 'маркет', 'market',
  ]);

  // Reported suspect SURNAME spellings: expose them for review, but never
  // rewrite/merge different profiles without stronger identity evidence.
  private readonly surnamesForReview = new Set([
    // Only manifestly malformed spellings (not genuine family-name
    // variants such as Телпов, Зуборев, Байбеков or Мамкев).
    'василрнко', 'каменсджиков', 'колйхаило',
    'малйшко', 'смолийанинов', 'сапрйкин',
  ]);

  private clean(value: string | null | undefined): string {
    return String(value ?? '')
      .normalize('NFKC')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[，,;；]+/g, ' ')
      .replace(/[‐‑‒–—]/g, '-')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private capitalized(value: string): string {
    return value.split('-').map((part) => part
      ? part.charAt(0).toLocaleUpperCase('ru') + part.slice(1).toLocaleLowerCase('ru')
      : '').join('-');
  }

  private convertWord(value: string): string {
    const lower = value.toLocaleLowerCase('ru');
    const exact = this.latinExceptions[lower];
    if (exact) return exact;
    if (/^[a-z]+(?:-[a-z]+)*$/i.test(value)) {
      // The published library performs the complex digraph conversion.
      // Word starts are handled individually so hyphenated names work.
      return this.capitalized(value.split('-')
        .map((part) => {
          const key = part.toLowerCase();
          const known = this.latinExceptions[key];
          if (known) return known;
          // cyrillic-to-translit-js supports "kh" but NOT a standalone
          // "h". It consequently leaves Latin h in otherwise Cyrillic
          // words (Urih, Haritonov, Apuhtin, Govoruhin, etc.).
          // Adapt the input to its supported transliteration convention:
          // h -> kh, but preserve actual sh/ch/zh/kh/shch digraphs.
          const libraryInput = key.replace(/(?<![sczk])h/g, 'kh');
          return this.transliterator.reverse(libraryInput);
        })
        .join('-'));
    }
    return this.capitalized(value);
  }

  normalize(value: string | null | undefined): string {
    const cleaned = this.clean(value);
    if (!cleaned) return '';
    const words = cleaned.split(' ').map((word) => this.convertWord(word));
    // Correct only the GIVEN NAME (normally the 2nd word in Results),
    // not a surname that happens to resemble another valid name.
    if (words.length > 1) {
      const fix = this.knownGivenNameCorrections[words[1].toLocaleLowerCase('ru')];
      if (fix) words[1] = fix;
    }
    return words.join(' ');
  }

  /**
   * Inspection is used BEFORE creating imported profiles. An unknown/invalid
   * person isn't auto-replaced with a guessed real person or two-letter name.
   * No destructive mutation is performed by inspection.
   */
  inspect(value: string | null | undefined): NameInspection {
    const original = this.clean(value);
    const normalized = this.normalize(original);
    const parts = normalized.split(/\s+/).filter(Boolean);
    const reasons: string[] = [];
    if (parts.length < 2) reasons.push('Не указаны фамилия и имя');
    if (parts.length > 4) reasons.push('Необычно много частей ФИО');
    if (/[0-9]/.test(normalized)) reasons.push('Цифры в ФИО: возможно название команды, а не человек');
    if (parts.some((part) => part.length < 3))
      reasons.push('Слишком короткая часть ФИО, требуется проверить источник');
    if (parts.some((part) => this.invalidPersonTokens.has(part.toLocaleLowerCase('ru'))))
      reasons.push('Похоже на псевдоним или название команды, проверьте ФИО');
    if (parts[0] && this.surnamesForReview.has(parts[0].toLocaleLowerCase('ru')))
      reasons.push('Сомнительное написание фамилии из исторического импорта; сверить с источником');
    // A mixed-script token has no safe general transliteration. Latin-only
    // tokens have been converted above, so any remaining Latin is suspect.
    if (/[a-z]/i.test(normalized)) reasons.push('Смешанное или неподдерживаемое написание');
    return { original, normalized, needsReview: reasons.length > 0, reasons };
  }

  toLatin(value: string | null | undefined): string {
    return this.transliterator.transform(this.normalize(value)).toLowerCase();
  }

  normalizeForMatching(value: string | null | undefined): string {
    return this.normalize(value).replace(/ё/gi, 'е').split(' ').slice(0, 2).join(' ').toLowerCase();
  }
}
