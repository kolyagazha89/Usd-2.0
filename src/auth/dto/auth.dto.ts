import {
  IsEmail,
  IsIn,
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
