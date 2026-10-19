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
  grigoriev: 'Григорьев', // Samara Results #34 = Registration #34, Kia Spectra
  klyev: 'Клюев', // Orel #20 + Smolensk #26 = Registration car Mazda 626
  shaulsky: 'Шаульский', // Rostov Results #4 = Registration #4
  shychkin: 'Щучкин', // Samara Results #72 = Registration #72, Lada Granta
  soloviev: 'Соловьёв', // Smolensk Results #3 = Registration #3, Opel Astra H
};

export const historicalExistingFullNameRepairs: Readonly<Record<string, string>> = {
  'сулеыманов руслан': 'Сулейманов Руслан',
  'чудаыкин дмитрий': 'Чудайкин Дмитрий',
  'стаыловскы василий': 'Стайловский Василий',
  'лвов петр': 'Львов Петр',
  'эмелияненко евгений': 'Емельяненко Евгений',
  'григориев алексей': 'Григорьев Алексей',
  'клыев даниил': 'Клюев Даниил',
  'шаулскы михаил': 'Шаульский Михаил',
  'шычкин егор': 'Щучкин Егор',
  'соловиев андрей': 'Соловьёв Андрей',
};

/** These source spellings remain UNVERIFIED; do not guess a Cyrillic surname. */
export const historicalNamesNeedingReview = [
  'Sidoorov Alexandr',
  'Chyaev Tigran',
  'Ksy Aperol',
] as const;
