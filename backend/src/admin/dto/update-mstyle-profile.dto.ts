import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateMstyleProfileDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  residentHoursMonthlyQuotaMin?: number;

  @IsOptional()
  @IsIn(['active', 'suspended', 'closed'])
  status?: 'active' | 'suspended' | 'closed';
}