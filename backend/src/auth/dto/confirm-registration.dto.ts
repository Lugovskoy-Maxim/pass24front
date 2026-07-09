import { IsEmail, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class ConfirmRegistrationDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code: string;
}