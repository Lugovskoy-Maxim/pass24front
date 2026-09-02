import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { EmptyToUndefined } from '../../common/dto-transforms';

export class ConfirmPasswordResetDto {
  @EmptyToUndefined()
  @ValidateIf((o) => !o.resetToken)
  @IsEmail({}, { message: 'Некорректный email' })
  email?: string;

  @ValidateIf((o) => !o.resetToken)
  @IsString()
  @IsNotEmpty()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'Код состоит из 4 цифр' })
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  resetToken?: string;

  @IsNotEmpty()
  @MinLength(6, { message: 'Пароль не менее 6 символов' })
  password: string;

  @IsNotEmpty({ message: 'Повторите пароль' })
  @MinLength(6)
  passwordConfirm: string;
}
