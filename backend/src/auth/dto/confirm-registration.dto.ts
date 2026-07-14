import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

export class ConfirmRegistrationDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code: string;
}