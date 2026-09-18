import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateMstyleProfileDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  residentHoursMonthlyQuotaMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  residentHoursMonthlyResetDay?: number;

  @IsOptional()
  @IsIn(['active', 'suspended', 'closed'])
  status?: 'active' | 'suspended' | 'closed';
}