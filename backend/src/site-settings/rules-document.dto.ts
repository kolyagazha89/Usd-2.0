import { IsString, MaxLength, Matches } from 'class-validator';

export class RulesDocumentTargetDto {
  @IsString()
  @MaxLength(100)
  @Matches(/^rules-draft-[a-f0-9-]{36}$/i)
  targetId!: string;
}
