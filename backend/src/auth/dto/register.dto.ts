import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
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

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  birthDate?: string;

  @IsNotEmpty({ message: 'Укажите название компании' })
  company: string;
}
