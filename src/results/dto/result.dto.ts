import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateResultDto {
  @IsUUID()
  registrationId!: string;

  @IsUUID()
  registrationClassId!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  value!: number;

  @IsIn(['DB', 'MPS', 'OTHER'])
  unit!: 'DB' | 'MPS' | 'OTHER';

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
  @IsIn(['DB', 'MPS', 'OTHER'])
  unit?: 'DB' | 'MPS' | 'OTHER';

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
