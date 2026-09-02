import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';
import { EmptyToUndefined } from '../../common/dto-transforms';

export class ConfirmRegistrationDto {
  @EmptyToUndefined()
  @ValidateIf((o) => o.email !== undefined)
  @IsEmail({}, { message: 'Некорректный email' })
  email?: string;

  @EmptyToUndefined()
  @ValidateIf((o) => o.phone !== undefined)
  @IsString()
  @IsNotEmpty({ message: 'Укажите номер телефона' })
  phone?: string;

  /**
   * Email OTP — 4 цифры (см. OTP_CODE_LENGTH).
   * Mobile ID SMS — обычно 4, допускаем 4–8 (код генерирует SMS Aero).
   */
  @IsString()
  @IsNotEmpty()
  @Length(4, 8)
  @Matches(/^\d{4,8}$/, { message: 'Код — от 4 до 8 цифр' })
  code: string;
}
