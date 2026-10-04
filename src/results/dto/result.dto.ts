import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

enum ResultUnitDto {
  DB = 'DB',
  MPS = 'MPS',
  OTHER = 'OTHER',
}

export class CreateResultDto {
  @IsUUID()
  registrationId!: string;

  @IsUUID()
  registrationClassId!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  value!: number;

  @IsEnum(ResultUnitDto)
  unit!: ResultUnitDto;

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

export class UpdateResultDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  value?: number;

  @IsOptional()
  @IsEnum(ResultUnitDto)
  unit?: ResultUnitDto;

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
