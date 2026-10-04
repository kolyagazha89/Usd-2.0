import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateDisqualificationDto {
  @IsUUID()
  participantId!: string;

  @IsIn(['STAGE', 'SEASON', 'FORMAT'])
  scope!: 'STAGE' | 'SEASON' | 'FORMAT';

  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsUUID()
  seasonId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}

export class RevokeDisqualificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  revokeReason!: string;
}
