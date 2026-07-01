import { IsIn, IsMongoId, IsOptional, IsString } from 'class-validator';

export class PassHistoryQueryDto {
  @IsIn(['visitor', 'office', 'company', 'bc'])
  scope: 'visitor' | 'office' | 'company' | 'bc';

  @IsOptional()
  @IsString()
  visitorName?: string;

  @IsOptional()
  @IsString()
  visitorPhone?: string;

  @IsOptional()
  @IsString()
  visitorPassportSeries?: string;

  @IsOptional()
  @IsString()
  visitorPassportNumber?: string;

  @IsOptional()
  @IsMongoId()
  officeId?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsMongoId()
  propertyId?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}