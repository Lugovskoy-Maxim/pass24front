import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @IsString()
  @IsNotEmpty({ message: 'Укажите токен приглашения' })
  token: string;

  @IsNotEmpty()
  @MinLength(6, { message: 'Пароль не менее 6 символов' })
  password: string;

  @IsNotEmpty({ message: 'Повторите пароль' })
  @MinLength(6)
  passwordConfirm: string;
}
