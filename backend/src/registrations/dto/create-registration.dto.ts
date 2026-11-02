import { RegistrationCountry } from '../../generated/prisma/enums';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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
  @ArrayMaxSize(5)
  @IsUUID('4', { each: true })
  classIds!: string[];

  @IsOptional()
  @IsUUID()
  configurationVersionId?: string;

  @IsOptional()
  @IsBoolean()
  rulesAccepted?: boolean;

  @IsOptional()
  @IsBoolean()
  privacyConsent?: boolean;

  @IsOptional()
  @IsBoolean()
  termsAccepted?: boolean;

  @IsOptional()
  @IsIn(['PRE_REGISTRATION', 'ON_SITE', 'IMPORT'])
  source?: 'PRE_REGISTRATION' | 'ON_SITE' | 'IMPORT';
}

/** Gate staff only; does not create an account or assert ownership of an old profile. */
export class CreateOnSiteProfileDto {
  @IsBoolean()
  privacyConsent!: boolean;

  @IsBoolean()
  termsAccepted!: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lastName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  middleName?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  brand!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  model!: string;

  @IsEnum(RegistrationCountry)
  registrationCountry!: RegistrationCountry;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  registrationNumber!: string;
}

/** Existing finished equipment version for a gate draft before results are entered. */
export class ConfirmOnSiteConfigurationDto {
  @IsUUID()
  configurationVersionId!: string;
}

/** An existing historical or USD participant can arrive with a new car. */
export class CreateOnSiteCarDto {
  @IsUUID()
  participantId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  brand!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  model!: string;

  @IsEnum(RegistrationCountry)
  registrationCountry!: RegistrationCountry;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  registrationNumber!: string;

  @IsBoolean()
  privacyConsent!: boolean;

  @IsBoolean()
  termsAccepted!: boolean;
}
