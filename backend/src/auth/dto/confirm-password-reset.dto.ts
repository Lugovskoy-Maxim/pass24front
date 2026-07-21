import { IsEmail, IsNotEmpty, IsString, Length, Matches, MinLength } from 'class-validator';
import { EmptyToUndefined } from '../../common/dto-transforms';

export class ConfirmPasswordResetDto {
  @EmptyToUndefined()
  @IsNotEmpty({ message: 'Укажите email' })
  @IsEmail({}, { message: 'Некорректный email' })
  email: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'Код состоит из 6 цифр' })
  code: string;

  @IsNotEmpty()
  @MinLength(6, { message: 'Пароль не менее 6 символов' })
  password: string;

  @IsNotEmpty({ message: 'Повторите пароль' })
  @MinLength(6)
  passwordConfirm: string;
}
