import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class ConfirmEmailVerifyDto {
  @IsString()
  @IsNotEmpty()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'Код состоит из 4 цифр' })
  code: string;
}
