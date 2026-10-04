import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateParticipantDto {
  @IsString()
  @MaxLength(120)
  lastName!: string;

  @IsString()
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
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  photoUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateParticipantDto extends CreateParticipantDto {
  lastName?: string;
  firstName?: string;
}
