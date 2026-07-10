import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateTenantEmployeePositionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}