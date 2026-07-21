import { IsEmail, IsNotEmpty } from 'class-validator';
import { EmptyToUndefined } from '../../common/dto-transforms';

export class RequestPasswordResetDto {
  @EmptyToUndefined()
  @IsNotEmpty({ message: 'Укажите email' })
  @IsEmail({}, { message: 'Некорректный email' })
  email: string;
}
