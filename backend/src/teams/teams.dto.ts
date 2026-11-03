import {
  IsBoolean,
  IsISO8601,
  IsArray,
  ArrayMaxSize,
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
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({each:true}) @MaxLength(100,{each:true}) images?: string[];
}
export class MembershipDecisionDto {
  @IsIn(['APPROVED', 'REJECTED', 'LEFT']) status!:
    'APPROVED' | 'REJECTED' | 'LEFT';
}

/** Review tokens are the exact server timestamp of the text + photo snapshot shown to ADMIN. */
export class TeamPostReviewDto {
  @IsISO8601({strict:true}) reviewedAt!: string;
}
