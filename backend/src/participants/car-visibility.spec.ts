import { redactInactiveCar, redactArchivedRegistration, redactArchivedResult } from './car-visibility';

describe('car history visibility projections', () => {
  const archived = {
    id: 'car-archive', isActive: false, isPublic: false,
    brand: 'Старинная марка', model: 'Редкая модель',
    registrationNumber: 'А999АА72', registrationCountry: 'RU',
    color: 'Красный', photoUrl: '/private/old.jpg',
  };

  it('retains the internal foreign key but removes all car details', () => {
    const visible = redactInactiveCar(archived);
    expect(visible).toMatchObject({
      id: 'car-archive', isActive: false, brand: 'Автомобиль скрыт',
      model: '', registrationNumber: null, registrationCountry: null,
      color: null, photoUrl: null,
    });
    expect(archived.brand).toBe('Старинная марка');
    expect(archived.registrationNumber).toBe('А999АА72');
  });

  it('does not alter a genuine active car', () => {
    const active = {...archived, isActive:true, brand:'Lada', model:'Vesta'};
    expect(redactInactiveCar(active)).toBe(active);
  });

  it('preserves official result values while hiding its retired vehicle', () => {
    const result = {id:'result-1',value:158.125,place:1,registration:{
      id:'reg-1',participantNumber:12,stageId:'stage-old',car:archived,
    }};
    const publicRow = redactArchivedResult(result);
    expect(publicRow.registration.car.brand).toBe('Автомобиль скрыт');
    expect(publicRow.registration.car.registrationNumber).toBeNull();
    expect(publicRow.value).toBe(158.125);
    expect(publicRow.place).toBe(1);
    expect(publicRow.registration.id).toBe('reg-1');
    expect(publicRow.registration.car.id).toBe('car-archive');
    expect(result.registration.car.brand).toBe('Старинная марка');
  });

  it('does not modify a historical registration without a populated car', () => {
    const row = {id:'reg',participantNumber:20,car:null};
    expect(redactArchivedRegistration(row)).toBe(row);
  });
});
