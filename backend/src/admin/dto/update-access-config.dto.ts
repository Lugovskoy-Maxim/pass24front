import { IsArray, IsIn, IsOptional } from 'class-validator';
import { ALL_PASS_TYPES } from '../../access/access.constants';

export class UpdateAccessConfigDto {
  @IsOptional()
  @IsArray()
  @IsIn([...ALL_PASS_TYPES], { each: true })
  enabledPassTypes?: string[];

  @IsOptional()
  rolePermissions?: Record<string, string[]>;
}