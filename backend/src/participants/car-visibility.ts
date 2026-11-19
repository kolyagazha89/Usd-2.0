/** A retired competition car must keep its IDs and historical foreign keys.
 * Only administrator's hidden-car archive may return its original details.
 * Apply to read DTOs, never mutate stored rows or immutable result snapshots.
 */
export function redactInactiveCar<T>(car: T): T {
  if (!car || typeof car !== 'object' || !('isActive' in car) || car.isActive !== false) return car;
  return {
    ...car,
    brand: 'Автомобиль скрыт',
    model: '',
    registrationNumber: null,
    registrationCountry: null,
    color: null,
    photoUrl: null,
  } as T;
}

export function redactArchivedRegistration<T>(registration: T): T {
  if (!registration || typeof registration !== 'object' || !('car' in registration)) return registration;
  const car = redactInactiveCar(registration.car);
  return car === registration.car ? registration : { ...registration, car } as T;
}

export function redactArchivedResult<T>(result: T): T {
  if (!result || typeof result !== 'object' || !('registration' in result)) return result;
  const registration = redactArchivedRegistration(result.registration);
  return registration === result.registration ? result : { ...result, registration } as T;
}
