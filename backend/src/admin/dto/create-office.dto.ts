import { IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateOfficeDto {
  @IsMongoId()
  propertyId: string;

  @IsNotEmpty()
  @IsString()
  number: string;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  areaSqm?: number;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsMongoId()
  tenantId?: string;
}