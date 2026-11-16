import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateParticipantDto {
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
  middleName?: string | null;

  @IsOptional()
  @IsDateString()
  birthDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  team?: string | null;

  @IsOptional()
  @IsPhoneNumber(undefined, { message: 'Введите корректный международный номер телефона с кодом страны' })
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateParticipantDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  middleName?: string | null;

  @IsOptional()
  @IsDateString()
  birthDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  team?: string | null;

  @IsOptional()
  @IsPhoneNumber(undefined, { message: 'Введите корректный международный номер телефона с кодом страны' })
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

/** All choices are explicit; omitted fields may never imply permission. */
export class PublicationConsentDto {
  @IsBoolean() fullName!: boolean;
  @IsBoolean() city!: boolean;
  @IsBoolean() team!: boolean;
  @IsBoolean() results!: boolean;
  @IsBoolean() car!: boolean;
  @IsBoolean() profilePhoto!: boolean;
  @IsBoolean() carPhoto!: boolean;
  @IsBoolean() eventImage!: boolean;
  @IsBoolean() promotionalImage!: boolean;
}
