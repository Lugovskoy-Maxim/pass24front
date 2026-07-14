import { IsEmail, IsIn, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class RegisterDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  phone?: string;

  @IsOptional()
  @IsIn(['email', 'phone'])
  verificationChannel?: 'email' | 'phone';

  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsOptional()
  fullName?: string;

  @IsOptional()
  lastName?: string;

  @IsOptional()
  firstName?: string;

  @IsOptional()
  middleName?: string;

  @IsNotEmpty({ message: 'Укажите название компании' })
  company: string;
}