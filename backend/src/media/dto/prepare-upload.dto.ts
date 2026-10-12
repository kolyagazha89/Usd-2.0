import { IsEnum, IsIn, IsString, IsUUID, MaxLength } from 'class-validator';
import { MediaTargetType } from '../../generated/prisma/enums';

export class PrepareUploadDto {
  @IsEnum(MediaTargetType)
  targetType!: MediaTargetType;

  @IsString()
  @MaxLength(120)
  targetId!: string;

  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
  contentType!: string;
}

export class CompleteUploadDto {
  @IsString()
  @MaxLength(64)
  uploadToken!: string;
}