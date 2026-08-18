import {
  IsArray,
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { EmptyToUndefined } from '../../common/dto-transforms';

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
  @EmptyToUndefined()
  @IsMongoId()
  tenantId?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  tenantIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  externalId?: string;
}
