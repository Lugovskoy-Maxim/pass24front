import { IsEmail, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

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

  @IsOptional()
  phone?: string;

  @IsNotEmpty({ message: 'Укажите название компании' })
  company: string;
}
