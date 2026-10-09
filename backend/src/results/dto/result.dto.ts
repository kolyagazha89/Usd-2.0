import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsBoolean,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateResultDto {
  @IsUUID()
  registrationId!: string;

  @IsUUID()
  registrationClassId!: string;

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

  @IsBoolean()
  confirmed!: boolean;
}

export class UpdateResultDto {
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


export class DeleteResultDto {
  @IsBoolean()
  confirmed!: boolean;

  @IsString()
  @MaxLength(1000)
  reason!: string;
}
