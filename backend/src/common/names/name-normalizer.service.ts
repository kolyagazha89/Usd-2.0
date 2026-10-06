import { Injectable } from '@nestjs/common';

@Injectable()
export class NameNormalizerService {
  private readonly transliteration: Record<string, string> = {
    // Фамилии / общие варианты
    'korolev': 'Королев',
    'lyutov': 'Лютов',
    'lytov': 'Лютов',
    'zemskov': 'Земсков',
    'isaev': 'Исаев',
    'zubanov': 'Зубанов',
    'krivonosov': 'Кривоносов',
    'lapshev': 'Лапшев',
    'laptev': 'Лаптев',
    'ivanov': 'Иванов',
    'kholodilin': 'Холодилин',
    'kamenshchikov': 'Каменщиков',
    'kamenshikov': 'Каменщиков',
    'kamynin': 'Камынин',
    'mokhov': 'Мохов',
    'kosolapov': 'Косолапов',
    'vasily': 'Василий',
    'vasiliy': 'Василий',
    'vasili': 'Василий',
    'vasilii': 'Василий',
    'vassily': 'Василий',
    'wassily': 'Василий',

    // Имена
    'daniil': 'Даниил',
    'dmitry': 'Дмитрий',
    'dmitriy': 'Дмитрий',
    'viktor': 'Виктор',
    'evgeny': 'Евгений',
    'evgeniy': 'Евгений',
    'nikolai': 'Николай',
    'nikolay': 'Николай',
    'alexander': 'Александр',
    'aleksandr': 'Александр',
    'igor': 'Игорь',
    'vadim': 'Вадим',
    'ivan': 'Иван',
    'pavel': 'Павел',
    'vyacheslav': 'Вячеслав',
    'mihail': 'Михаил',
    'mikhail': 'Михаил',
    'allayar': 'Аллаяр',
    'arman': 'Армен',
    'armen': 'Армен',
    'anton': 'Антон',
    'shulgin': 'Шульгин',
    'eduard': 'Эдуард',
    'ismagulov': 'Исмагулов',
    'beksan': 'Бексан',
    'tomashevskaya': 'Томашевская',
    'irina': 'Ирина',
    'kiyakov': 'Кияков',
    'shakir': 'Шакир',
    'karpov': 'Карпов',
    'ramil': 'Рамиль',
    'babashov': 'Бабашов',
    'timur': 'Тимур',
    'tambovcev': 'Тамбовцев',
    'afanasiev': 'Афанасьев',
    'roman': 'Роман',
    'dzhanhotov': 'Джанхотов',
    'muslim': 'Муслим',
    'mursalimov': 'Мурсалимов',
    'artem': 'Артем',
    'gaidarov': 'Гейдаров',
    'husein': 'Хусейн',
    'hussein': 'Хусейн',
    'tatarinov': 'Татаринов',
    'maksim': 'Максим',
    'sabelnikov': 'Сабельников',
    'lazarev': 'Лазарев',
    'sergey': 'Сергей',
    'goryachev': 'Горячев',
    'vladislav': 'Владислав',
    'makarevich': 'Макаревич',
    'bakulev': 'Бакулев',
    'rysuhin': 'Рысухин',
    'shushpannikv': 'Шушпанников',
    'shushpannikov': 'Шушпанников',
    'danil': 'Данил',
    'dubkov': 'Дубков',
    'alexandr': 'Александр',
    'rusik': 'Русик',
    'ruslan': 'Руслан',
    'matveev': 'Матвеев',
    'zaharov': 'Захаров',
    'latysheva': 'Латышева',
    'kseniya': 'Ксения',
    'teplov': 'Теплов',
    'nikita': 'Никита',
    'vorobiev': 'Воробьев',
    'vorobyev': 'Воробьев',
    'andrey': 'Андрей',
    'zacepilov': 'Зацепилов',
    'kirill': 'Кирилл',
    'voitenko': 'Войтенко',
    'misheryakov': 'Мещеряков',
    '34': '34',
  };

  normalize(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    const cleaned = value
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/ё/gi, 'е');

    if (!cleaned) {
      return '';
    }

    const words = cleaned.split(' ');

    const normalizedWords = words.map((word) => {
      const lower = word.toLowerCase();

      if (this.transliteration[lower]) {
        return this.transliteration[lower];
      }

      return this.transliterateLatinWord(word);
    });

    return normalizedWords.join(' ');
  }

  normalizeForMatching(value: string | null | undefined): string {
    const normalized = this.normalize(value);

    if (!normalized) {
      return '';
    }

    const words = normalized.split(' ');

    // Для исторических результатов обычно достаточно
    // фамилии + имени. Отчество не является обязательным.
    return words
      .slice(0, 2)
      .join(' ')
      .toLowerCase();
  }

  private transliterateLatinWord(value: string): string {
    const lower = value.toLowerCase();
    if (!/^[a-z]+$/.test(lower)) {
      return this.capitalizeRussian(value);
    }

    const digraphs: Record<string, string> = {
      shch: 'щ', zh: 'ж', kh: 'х', ts: 'ц', ch: 'ч', sh: 'ш',
      yu: 'ю', ya: 'я', yo: 'ё', ye: 'е', yi: 'ы',
      ey: 'ей', iy: 'ий', y: 'й',
    };
    const letters: Record<string, string> = {
      a: 'а', b: 'б', c: 'к', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х',
      i: 'и', j: 'дж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п',
      q: 'к', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'кс',
      z: 'з',
    };

    let rest = lower;
    let result = '';
    const orderedDigraphs = Object.keys(digraphs).sort((a, b) => b.length - a.length);
    while (rest.length > 0) {
      const digraph = orderedDigraphs.find((key) => rest.startsWith(key));
      if (digraph) {
        result += digraphs[digraph];
        rest = rest.slice(digraph.length);
        continue;
      }
      const letter = rest[0];
      result += letters[letter] ?? letter;
      rest = rest.slice(1);
    }

    return this.capitalizeRussian(result);
  }

  private capitalizeRussian(value: string): string {
    if (!value) {
      return '';
    }

    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }
}