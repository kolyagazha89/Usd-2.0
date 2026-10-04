import { RegistrationCountry } from '../../generated/prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateHistoricalResultDto {
  @IsUUID()
  stageId!: string;

  @IsUUID()
  participantId!: string;

  @IsOptional()
  @IsUUID()
  carId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  carBrand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  carModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  registrationNumber?: string;

  @IsOptional()
  @IsEnum(RegistrationCountry)
  registrationCountry?: RegistrationCountry;

  @IsInt()
  @Min(1)
  @Max(999999)
  participantNumber!: number;

  @IsUUID()
  classId!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  value!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  place?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateHistoricalResultDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  value?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  place?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
