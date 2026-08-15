import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
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

  /** Email OTP — 6 цифр; Mobile ID SMS OTP — обычно 4–6 (допускаем 4–8). */
  @IsString()
  @IsNotEmpty()
  @Length(4, 8)
  @Matches(/^\d{4,8}$/)
  code: string;
}
