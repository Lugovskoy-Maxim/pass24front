import { IsEmail, IsNotEmpty } from 'class-validator';

export class SendPassEmailDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;
}