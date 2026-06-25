import { IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
}
