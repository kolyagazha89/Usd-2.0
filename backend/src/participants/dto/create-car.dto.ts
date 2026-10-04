import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { RegistrationCountry } from '../../generated/prisma/enums';

export class CreateCarDto {
  @IsString()
  @MaxLength(80)
  brand!: string;

  @IsString()
  @MaxLength(120)
  model!: string;

  @IsEnum(RegistrationCountry)
  registrationCountry!: RegistrationCountry;

  @IsString()
  @MaxLength(32)
  registrationNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  color?: string | null;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
