import { IsEmail, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsNotEmpty()
  fullName: string;

  @IsOptional()
  phone?: string;

  @IsOptional()
  company?: string;

  @IsOptional()
  office?: string;

  @IsOptional()
  floor?: string;
}
