import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class AcceptMeasurementDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  place?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class RejectMeasurementDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  note!: string;
}
