import { IsArray, IsObject, IsOptional, IsUUID, ValidateNested } from 'class-validator';

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
}

export class ResolveImportRowDto {
  @IsObject()
  resolution!: Record<string, unknown>;
}
