import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { EmptyToUndefined } from '../../common/dto-transforms';

export class RequestPasswordResetDto {
  @EmptyToUndefined()
  @ValidateIf((o) => !o.phone)
  @IsEmail({}, { message: 'Некорректный email' })
  email?: string;

  @EmptyToUndefined()
  @ValidateIf((o) => !o.email)
  @IsString()
  @IsNotEmpty({ message: 'Укажите номер телефона' })
  phone?: string;
}
