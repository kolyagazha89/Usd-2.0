import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

enum DisqualificationScopeDto {
  STAGE = 'STAGE',
  SEASON = 'SEASON',
  FORMAT = 'FORMAT',
}

export class CreateDisqualificationDto {
  @IsUUID()
  participantId!: string;

  @IsEnum(DisqualificationScopeDto)
  scope!: DisqualificationScopeDto;

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
