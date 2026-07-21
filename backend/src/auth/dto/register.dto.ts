import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { EmptyToUndefined } from '../../common/dto-transforms';

export class RegisterDto {
  @EmptyToUndefined()
  @ValidateIf((o) => o.email !== undefined)
  @IsEmail({}, { message: 'Некорректный email' })
  email?: string;

  @EmptyToUndefined()
  @ValidateIf((o) => o.verificationChannel === 'phone')
  @IsString()
  @IsNotEmpty({ message: 'Укажите номер телефона' })
  phone?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsIn(['email', 'phone'])
  verificationChannel?: 'email' | 'phone';

  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsNotEmpty({ message: 'Повторите пароль' })
  @MinLength(6)
  passwordConfirm: string;

  @IsOptional()
  fullName?: string;

  @IsOptional()
  lastName?: string;

  @IsOptional()
  firstName?: string;

  @IsOptional()
  middleName?: string;

  @IsNotEmpty({ message: 'Укажите название компании' })
  company: string;
}