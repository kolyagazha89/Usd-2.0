import { parseBassRaceText } from './bassrace-text-parser';

describe('BassRace pasted program results', () => {
  const protocol = `BassRace
120.0 To 129.9
1 129,90 055 Kostrykov Alexandr
2 129,65 024 Roman Vasiliy
5 129,93 050 Haritonov Danil

130.0 To 139.9
1 139,70 077 Antoha Fs
2 139,80 021 Zhidkov Yriy

140.0 To 149.9
1 149,82 049 Risuhin Nikita
2 149,95 134 Sichev Nikita
4 140,18 028 Al-tamimi Ruslan`;

  it('preserves official order and class-specific sticker numbers, not dB sorting', () => {
    const rows = parseBassRaceText(protocol);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({ classMark: 129.9, place: 1, number: 55, value: 129.9 });
    expect(rows[2]).toMatchObject({ classMark: 129.9, place: 5, number: 50, value: 129.93 });
    expect(rows[4]).toMatchObject({ classMark: 139.9, place: 2, number: 21, value: 139.8 });
    expect(rows[7]).toMatchObject({ classMark: 149.9, place: 4, number: 28, printedName: 'Al-tamimi Ruslan' });
  });

  it('accepts Windows line endings and the fourth class', () => {
    expect(parseBassRaceText('BassRace\r\n150.0 To 159.9\r\n1 159,90 009 Sample Racer\r\n'))
      .toMatchObject([{ classMark: 159.9, place: 1, number: 9, value: 159.9 }]);
  });

  it.each([
    ['missing title', '120.0 To 129.9\n1 129,90 055 Sample Racer'],
    ['unknown range', 'BassRace\n160.0 To 169.9\n1 159,90 055 Sample Racer'],
    ['unknown row', 'BassRace\n120.0 To 129.9\ninvalid row'],
    ['missing name', 'BassRace\n120.0 To 129.9\n1 129,90 055'],
    ['duplicate', 'BassRace\n120.0 To 129.9\n1 129,90 055 Sample Racer\n2 129,91 055 Another Racer'],
  ])('rejects %s instead of silently dropping data', (_label, text) => {
    expect(() => parseBassRaceText(text)).toThrow();
  });
});
