import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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

  @IsNotEmpty()
  visitDate: string;

  @IsOptional()
  visitTimeFrom?: string;

  @IsOptional()
  visitTimeTo?: string;

  @IsNotEmpty()
  office: string;

  @IsOptional()
  floor?: string;

  @IsOptional()
  comment?: string;
}
