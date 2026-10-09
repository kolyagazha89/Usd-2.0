import { IsArray, IsBoolean, IsObject, IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';

export class PreviewImportDto {
  @IsUUID()
  stageId!: string;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  registrations?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  results?: Record<string, unknown>[];

  @IsOptional()
  @IsBoolean()
  historicalResults?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourceFilename?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(512)
  sourcePostUrl?: string;
}

export class ResolveImportRowDto {
  @IsObject()
  resolution!: Record<string, unknown>;
}
