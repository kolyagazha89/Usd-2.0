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
  it('accepts up to five classes including multiple BassRace classes', async () => {
    const dto = validDto(Array.from({ length: 5 }, (_, index) => uuid(index + 10)));

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('accepts six or more unique class IDs because the service limits classes per sticker', async () => {
    const dto = validDto(Array.from({ length: 9 }, (_, index) => uuid(index + 10)));
    await expect(validate(dto)).resolves.toHaveLength(0);
  });
  it('allows omitting configuration for an explicitly on-site intake (service enforces source)', async () => {
    const dto=validDto([uuid(10)]);
    dto.configurationVersionId=undefined;
    dto.source='ON_SITE';
    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
