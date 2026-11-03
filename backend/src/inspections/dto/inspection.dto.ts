import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateInspectionDto {
  @IsUUID()
  registrationId!: string;

  @IsIn(['PASSED', 'FAILED'])
  status!: 'PASSED' | 'FAILED';

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

/** One immutable offline decision per call; no bulk optimistic updates. */
export class SyncOfflineInspectionDto {
  @IsUUID('4')
  operationId!: string;

  @IsUUID()
  stageId!: string;

  @IsUUID()
  registrationId!: string;

  @IsUUID()
  actorId!: string;

  @IsISO8601({ strict: true })
  createdAt!: string;

  @IsOptional()
  @IsUUID()
  baseInspectionId?: string | null;

  @IsIn(['PASSED', 'FAILED'])
  status!: 'PASSED' | 'FAILED';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
