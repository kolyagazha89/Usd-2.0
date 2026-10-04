import { IsEnum, IsString, MaxLength } from 'class-validator';
import { MediaTargetType } from '../../generated/prisma/enums';

export class PrepareUploadDto {
  @IsEnum(MediaTargetType)
  targetType!: MediaTargetType;

  @IsString()
  @MaxLength(128)
  targetId!: string;

  @IsString()
  @MaxLength(100)
  contentType!: string;
}

export class CompleteUploadDto {
  @IsString()
  @MaxLength(128)
  uploadToken!: string;
}
