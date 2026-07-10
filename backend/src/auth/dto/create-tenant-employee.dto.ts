import { IsEmail, IsMongoId, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

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

  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsMongoId()
  categoryId?: string;
}