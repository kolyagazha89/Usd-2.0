import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { RegistrationStatus } from '../../generated/prisma/enums';

export class UpdateRegistrationDto {
  @IsOptional()
  @IsUUID()
  participantId?: string;

  @IsOptional()
  @IsUUID()
  carId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  classIds?: string[];

  @IsOptional()
  @IsEnum(RegistrationStatus)
  status?: RegistrationStatus;
}