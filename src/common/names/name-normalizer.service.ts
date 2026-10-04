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

      return this.capitalizeRussian(word);
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

  private capitalizeRussian(value: string): string {
    if (!value) {
      return '';
    }

    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }
}