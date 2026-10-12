import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ResultUnit } from '../../generated/prisma/enums';

export class CreateMeasurementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(36)
  registrationId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(36)
  registrationClassId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  deviceType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceSerial?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  measurementType!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(999999.999)
  value!: number;

  @IsEnum(ResultUnit)
  unit!: ResultUnit;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000)
  frequencyHz?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600000)
  durationMs?: number;

  @IsDateString()
  measuredAt!: string;

  @IsOptional()
  @IsObject()
  rawData?: Record<string, unknown>;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey!: string;
}
