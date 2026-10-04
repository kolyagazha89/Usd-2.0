import { IsEnum, IsIn, IsString, IsUUID, MaxLength } from 'class-validator';
import { MediaTargetType } from '../../generated/prisma/enums';

export class PrepareUploadDto {
  @IsEnum(MediaTargetType)
  targetType!: MediaTargetType;

  @IsUUID()
  targetId!: string;

  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType!: string;
}

export class CompleteUploadDto {
  @IsString()
  @MaxLength(64)
  uploadToken!: string;
}
