import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class ConfirmEmailVerifyDto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'Код состоит из 6 цифр' })
  code: string;
}
