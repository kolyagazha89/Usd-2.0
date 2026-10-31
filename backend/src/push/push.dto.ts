import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
export class PushPreferencesDto {
  @IsBoolean() registrationOpen: boolean;
  @IsBoolean() reminders: boolean;
  @IsBoolean() announcements: boolean;
}
class PushKeysDto {
  @IsString() @MaxLength(100) p256dh: string;
  @IsString() @MaxLength(30) auth: string;
}
export class PushSubscribeDto extends PushPreferencesDto {
  @IsString() @MaxLength(2048) endpoint: string;
  @IsObject() @ValidateNested() @Type(() => PushKeysDto) keys: PushKeysDto;
  @Equals(true) consent: boolean;
  @IsIn(['web-push-v1']) consentVersion: string;
}
export class PushAnnouncementDto {
  @IsUUID() requestKey: string;
  @IsString() @MinLength(1) @MaxLength(80) title: string;
  @IsString() @MinLength(1) @MaxLength(240) body: string;
  @IsString() @MaxLength(300) path: string;
  @Equals(true) confirmed: boolean;
  @IsOptional() @IsUUID() stageId?: string;
}
