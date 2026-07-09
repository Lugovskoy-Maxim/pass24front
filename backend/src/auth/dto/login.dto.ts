import { IsNotEmpty, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class LoginDto {
  @ValidateIf((o) => !o.email)
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  login?: string;

  /** Совместимость со старыми клиентами */
  @ValidateIf((o) => !o.login)
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  email?: string;

  @IsNotEmpty()
  @MinLength(4)
  password: string;
}
