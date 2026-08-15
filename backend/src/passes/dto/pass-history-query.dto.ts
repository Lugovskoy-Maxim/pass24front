import { IsIn, IsMongoId, IsOptional, IsString } from 'class-validator';

const PASS_TYPES = ['visitor', 'parking', 'delivery', 'contractor'] as const;
const PASS_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'active',
  'completed',
  'expired',
  'cancelled',
] as const;

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
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsIn(PASS_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(PASS_TYPES)
  passType?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  offset?: string;
}
