import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

enum RegistrationSourceDto {
  PRE_REGISTRATION = 'PRE_REGISTRATION',
  ON_SITE = 'ON_SITE',
  IMPORT = 'IMPORT',
}

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
  @IsEnum(RegistrationSourceDto)
  source?: RegistrationSourceDto;
}
