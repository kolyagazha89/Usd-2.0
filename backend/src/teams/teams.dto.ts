import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateTeamDto {
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsString() @MaxLength(100) commanderUserId?: string | null;
}
export class UpdateTeamDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsString() @MaxLength(100) commanderUserId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class TeamPostDto {
  @IsIn(['NEWS', 'ACHIEVEMENT']) kind!: 'NEWS' | 'ACHIEVEMENT';
  @IsString() @Length(1, 160) title!: string;
  @IsString() @Length(1, 10000) body!: string;
  @IsIn(['DRAFT', 'IN_REVIEW', 'PUBLISHED']) status!:
    'DRAFT' | 'IN_REVIEW' | 'PUBLISHED';
}
export class MembershipDecisionDto {
  @IsIn(['APPROVED', 'REJECTED', 'LEFT']) status!:
    'APPROVED' | 'REJECTED' | 'LEFT';
}
