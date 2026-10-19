/**
 * Exact, source-verified spellings from the historical Results workbook.
 *
 * These are spelling repairs, NOT fuzzy identity merges. Never apply a
 * surname-only similarity guess to a different participant.
 * Full-name pairs below identify the malformed profiles produced by the
 * previous Latin -> Cyrillic import run.
 */
export const historicalLatinSurnameSpellings: Readonly<Record<string, string>> = {
  suleymanov: 'Сулейманов', // Suleymanov Ruslan
  chudaykin: 'Чудайкин', // Chudaykin Dmitry
  staylovsky: 'Стайловский', // Staylovsky Vasily
  lvov: 'Львов', // Lvov Petr
  emeliyanenko: 'Емельяненко', // Emeliyanenko Evgeny
};

export const historicalExistingFullNameRepairs: Readonly<Record<string, string>> = {
  'сулеыманов руслан': 'Сулейманов Руслан',
  'чудаыкин дмитрий': 'Чудайкин Дмитрий',
  'стаыловскы василий': 'Стайловский Василий',
  'лвов петр': 'Львов Петр',
  'эмелияненко евгений': 'Емельяненко Евгений',
};

/** These source spellings remain UNVERIFIED; do not guess a Cyrillic surname. */
export const historicalNamesNeedingReview = [
  'Sidoorov Alexandr',
  'Shaulsky Mihail',
  'Chyaev Tigran',
  'Shychkin Egor',
] as const;
