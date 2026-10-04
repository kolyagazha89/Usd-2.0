import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { RegistrationCountry } from '../../generated/prisma/enums';

export class UpdateCarDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsEnum(RegistrationCountry)
  registrationCountry?: RegistrationCountry;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  color?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  photoUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
