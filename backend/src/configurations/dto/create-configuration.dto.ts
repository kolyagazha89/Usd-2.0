
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

enum CarDirection {
  FRONT = 'FRONT',
  REAR = 'REAR',
  SUB = 'SUB',
}

enum AudioComponentType {
  SUBWOOFER = 'SUBWOOFER',
  MIDBASS = 'MIDBASS',
  MIDRANGE = 'MIDRANGE',
  HORN = 'HORN',
  OTHER = 'OTHER',
}

export class CreateHeadUnitDto {
  @IsString()
  brand: string;

  @IsString()
  model: string;

  @IsEnum(CarDirection)
  direction: CarDirection;
}

export class CreateAudioComponentDto {
  @IsString()
  brand: string;

  @IsString()
  model: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsEnum(AudioComponentType)
  type: AudioComponentType;

  @IsEnum(CarDirection)
  direction: CarDirection;
}

export class CreateAmplifierComponentLinkDto {
  @IsString()
  componentId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateAmplifierDto {
  @IsString()
  brand: string;

  @IsString()
  model: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsEnum(CarDirection)
  direction: CarDirection;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAmplifierComponentLinkDto)
  componentLinks: CreateAmplifierComponentLinkDto[];
}

export class CreateBatteryDto {
  @IsString()
  brand: string;

  @IsString()
  model: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateGeneratorDto {
  @IsString()
  brand: string;

  @IsString()
  model: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateConfigurationDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  vibrationIsolation?: string;

  @IsOptional()
  @IsString()
  additionalDescription?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateHeadUnitDto)
  headUnits: CreateHeadUnitDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAudioComponentDto)
  audioComponents: CreateAudioComponentDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAmplifierDto)
  amplifiers: CreateAmplifierDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBatteryDto)
  batteries: CreateBatteryDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateGeneratorDto)
  generators: CreateGeneratorDto[];
}