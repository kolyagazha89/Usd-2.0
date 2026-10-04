import { RegistrationCountry } from '../../generated/prisma/enums';

export class UpdateCarDto {
  brand?: string;

  model?: string;

  registrationCountry?: RegistrationCountry;

  registrationNumber?: string;

  color?: string | null;

  photoUrl?: string | null;

  isPublic?: boolean;

  isActive?: boolean;
}