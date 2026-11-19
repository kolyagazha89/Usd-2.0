import { criticalStageChanges, criticalStageSnapshot } from './stage-critical-notice';

const example = {
  id: 'stage-1', name: 'USD Cup', date: new Date('2026-12-05T12:00:00.000Z'),
  startTimeMsk: '10:00', city: 'Краснодар', venue: 'Площадка А',
  address: 'Улица 1', status: 'PUBLISHED', description: 'старое описание',
};

describe('critical stage notice rules', () => {
  it('ignores poster, classes, description, name, registration windows and coordinates', () => {
    const before = criticalStageSnapshot(example);
    const after = criticalStageSnapshot({
      ...example, name: 'New name', description: 'new',
      latitude: 32, longitude: 40, registrationOpen: false,
      stageClasses: [{ id: 'class-9' }], poster: 'new.jpg',
    });
    expect(criticalStageChanges(before, after)).toEqual([]);
  });
  it('detects only actual date, start-time, city, venue, address and cancellation changes', () => {
    const before = criticalStageSnapshot(example);
    const after = criticalStageSnapshot({
      ...example, date: new Date('2026-12-06T12:00:00Z'), startTimeMsk: '11:00',
      city: 'Сочи', venue: 'Площадка Б', address: 'Улица 2', status: 'CANCELLED',
    });
    expect(criticalStageChanges(before, after)).toEqual(['date','startTimeMsk','city','venue','address','cancelled']);
  });
  it('normalizes equivalent date storage, empty strings, spaces and default Moscow start time', () => {
    const before = criticalStageSnapshot({...example, venue: null, startTimeMsk:null});
    const after = criticalStageSnapshot({...example, date:'2026-12-05T00:00:00Z',venue:'  ',startTimeMsk:'10:00'});
    expect(criticalStageChanges(before, after)).toEqual([]);
  });
  it('reversing a pending change to the notified baseline clears the pending difference', () => {
    const baseline = criticalStageSnapshot(example);
    expect(criticalStageChanges(baseline, criticalStageSnapshot({...example,address:'Новый адрес'}))).toEqual(['address']);
    expect(criticalStageChanges(baseline, criticalStageSnapshot(example))).toEqual([]);
  });
});