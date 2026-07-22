import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Пароль не задаётся владельцем — сотрудник получает email-приглашение. */
export class CreateTenantEmployeeDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  lastName: string;

  @IsNotEmpty()
  @IsString()
  firstName: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}