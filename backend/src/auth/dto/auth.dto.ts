import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

}

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class EmailDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class TokenDto {
  @IsString()
  @Matches(TOKEN_PATTERN)
  token!: string;
}

export class ResetPasswordDto {
  @IsString()
  @Matches(TOKEN_PATTERN)
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class ChangeEmailDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

export class AdminCreateUserDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @IsIn(['ADMIN', 'JUDGE', 'PARTICIPANT'])
  role!: 'ADMIN' | 'JUDGE' | 'PARTICIPANT';
}

export class AdminUserActiveDto {
  @IsBoolean()
  active!: boolean;
}

export class AdminUserRoleDto {
  @IsIn(['ADMIN', 'JUDGE', 'PARTICIPANT'])
  role!: 'ADMIN' | 'JUDGE' | 'PARTICIPANT';
}


export class AdminCreateRoleDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{1,49}$/)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsObject()
  permissions!: Record<string, unknown>;
}

export class AdminUpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsObject()
  permissions?: Record<string, unknown>;
}

export class AdminUserCustomRoleDto {
  @IsOptional()
  @IsString()
  customRoleId?: string | null;
}
