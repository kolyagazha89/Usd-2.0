import { Prisma } from '../../generated/prisma/client';

import {
  IsArray,
  IsBoolean,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateDirectionDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}

export class UpdateDirectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateClassDto {
  @IsUUID()
  directionId!: string;

  @IsString()
  @MaxLength(64)
  code!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsIn(['DB', 'MPS', 'OTHER'])
  unit?: 'DB' | 'MPS' | 'OTHER';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}

export class UpdateClassDto {
  @IsOptional()
  @IsUUID()
  directionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsIn(['DB', 'MPS', 'OTHER'])
  unit?: 'DB' | 'MPS' | 'OTHER';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AddStageClassDto {
  @IsUUID()
  classId!: string;
}

export class ReplaceStageClassesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  classIds!: string[];
}

export class UpdateStageClassDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  participantLimit?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  customName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  settings?: Prisma.InputJsonValue | null;
}
