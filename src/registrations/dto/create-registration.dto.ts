import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class CreateRegistrationDto {
  @IsUUID()
  carId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  classIds!: string[];
}