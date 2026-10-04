import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateStageDto {
  @IsInt()
  @Min(1)
  @Max(999)
  stageNumber!: number;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsBoolean()
  registrationOpen?: boolean;

  @IsOptional()
  @IsUUID()
  seasonId?: string;

  @IsOptional()
  @IsDateString()
  registrationStartsAt?: string;

  @IsOptional()
  @IsDateString()
  registrationEndsAt?: string;

  @IsInt()
  @Min(2000)
  @Max(3000)
  seasonYear!: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  seasonName?: string;
}

export class UpdateStageDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  stageNumber?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsBoolean()
  registrationOpen?: boolean;

  @IsOptional()
  @IsDateString()
  registrationStartsAt?: string | null;

  @IsOptional()
  @IsDateString()
  registrationEndsAt?: string | null;
}
