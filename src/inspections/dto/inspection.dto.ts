import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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
  @IsIn(['PASSED', 'FAILED'])
  status?: 'PASSED' | 'FAILED';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
