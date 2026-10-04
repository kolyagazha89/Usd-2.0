import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';

export class CreateRegistrationDto {
  @IsUUID()
  stageId!: string;

  @IsUUID()
  participantId!: string;

  @IsUUID()
  carId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsUUID('4', { each: true })
  classIds!: string[];

  @IsUUID()
  configurationVersionId!: string;

  @IsOptional()
  @IsIn(['PRE_REGISTRATION', 'ON_SITE', 'IMPORT'])
  source?: 'PRE_REGISTRATION' | 'ON_SITE' | 'IMPORT';
}
