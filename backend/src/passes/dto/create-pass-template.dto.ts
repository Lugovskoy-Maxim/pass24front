import { IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePassTemplateDto {
  @IsNotEmpty()
  @IsString()
  name: string;

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