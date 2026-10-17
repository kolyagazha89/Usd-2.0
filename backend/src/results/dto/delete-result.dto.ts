import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

export class DeleteResultDto {
  @IsBoolean()
  confirmed!: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
