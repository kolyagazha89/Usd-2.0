import { validate } from 'class-validator';

import { CreateRegistrationDto } from './create-registration.dto';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function validDto(classIds: string[]): CreateRegistrationDto {
  return Object.assign(new CreateRegistrationDto(), {
    stageId: uuid(1),
    participantId: uuid(2),
    carId: uuid(3),
    configurationVersionId: uuid(4),
    classIds,
  });
}

describe('CreateRegistrationDto', () => {
  it('accepts more than five classes so multiple BassRace classes can be selected', async () => {
    const dto = validDto(Array.from({ length: 7 }, (_, index) => uuid(index + 10)));

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects more than the supported maximum of 32 classes', async () => {
    const dto = validDto(Array.from({ length: 33 }, (_, index) => uuid(index + 10)));

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'classIds')).toBe(true);
    expect(errors.find((error) => error.property === 'classIds')?.constraints).toHaveProperty('arrayMaxSize');
  });
});
