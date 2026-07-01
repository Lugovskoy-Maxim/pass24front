import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsMongoId, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreatePassDto {
  @IsNotEmpty()
  visitorName: string;

  @IsOptional()
  visitorPhone?: string;

  @IsOptional()
  companyName?: string;

  @IsOptional()
  visitPurpose?: string;

  @IsNotEmpty()
  passType: string;

  @IsOptional()
  vehiclePlate?: string;

  @IsOptional()
  vehicleModel?: string;

  @IsNotEmpty({ message: 'Укажите дату визита' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Некорректная дата визита' })
  visitDate: string;

  @IsOptional()
  visitTimeFrom?: string;

  @IsOptional()
  visitTimeTo?: string;

  @IsOptional()
  @IsMongoId()
  officeId?: string;

  @IsOptional()
  @IsString()
  office?: string;

  @IsOptional()
  floor?: string;

  @IsOptional()
  comment?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  sendEmail?: boolean;

  @IsOptional()
  @IsEmail()
  recipientEmail?: string;
}
