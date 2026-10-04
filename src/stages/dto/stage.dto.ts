import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  venue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'COMPLETED' | 'CANCELLED';

  @IsOptional()
  @IsBoolean()
  registrationOpen?: boolean;

  @IsOptional()
  @IsDateString()
  registrationStartsAt?: string;

  @IsOptional()
  @IsDateString()
  registrationEndsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(3000)
  seasonYear?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  seasonName?: string;

  @IsOptional()
  @IsUUID()
  seasonId?: string;
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
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  venue?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @IsOptional()
  @IsNumber()
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  longitude?: number | null;

  @IsOptional()
  @IsEnum(StageStatusDto)
  status?: StageStatusDto;

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
