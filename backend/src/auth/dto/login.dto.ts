import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  login: string;

  @IsNotEmpty()
  @MinLength(4)
  password: string;
}
