import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

enum InspectionStatusDto {
  PASSED = 'PASSED',
  FAILED = 'FAILED',
}

export class CreateInspectionDto {
  @IsUUID()
  registrationId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateInspectionDto {
  @IsOptional()
  @IsEnum(InspectionStatusDto)
  status?: InspectionStatusDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
