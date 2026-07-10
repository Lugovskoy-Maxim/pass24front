import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTenantEmployeeCategoryDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsArray()
  @IsString({ each: true })
  permissions: string[];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}