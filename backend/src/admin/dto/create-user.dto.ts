import { IsArray, IsBoolean, IsEmail, IsIn, IsMongoId, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsIn(['tenant', 'security', 'admin'])
  role: string;

  @IsOptional()
  @IsString()
  office?: string;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  officeIds?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  propertyIds?: string[];
}