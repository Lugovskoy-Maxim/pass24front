import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsMongoId, IsObject, IsOptional, Max, Min } from 'class-validator';

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
  @IsBoolean()
  isPrimaryProfile?: boolean;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  secondaryUserIds?: string[];

  @IsOptional()
  @IsIn(['active', 'suspended', 'closed'])
  status?: 'active' | 'suspended' | 'closed';

  @IsOptional()
  @IsObject()
  privateData?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  privateDataRevision?: number;
}