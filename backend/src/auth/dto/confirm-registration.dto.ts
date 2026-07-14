import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';
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

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code: string;
}