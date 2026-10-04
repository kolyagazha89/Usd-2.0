import { RegistrationCountry } from '../../generated/prisma/enums';

export class CreateCarDto {
  brand!: string;

  model!: string;

  registrationCountry!: RegistrationCountry;

  registrationNumber!: string;

  color?: string | null;

  photoUrl?: string | null;

  isPublic?: boolean;
}