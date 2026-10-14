import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';

export class CreateRegistrationDto {
  @IsUUID()
  stageId!: string;

  @IsOptional()
  @IsUUID()
  participantId?: string;

  @IsUUID()
  carId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(32)
  @IsUUID('4', { each: true })
  classIds!: string[];

  @IsUUID()
  configurationVersionId!: string;

  @IsOptional()
  @IsBoolean()
  rulesAccepted?: boolean;

  @IsOptional()
  @IsIn(['PRE_REGISTRATION', 'ON_SITE', 'IMPORT'])
  source?: 'PRE_REGISTRATION' | 'ON_SITE' | 'IMPORT';
}
