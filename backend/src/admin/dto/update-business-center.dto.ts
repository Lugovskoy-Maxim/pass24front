import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateBusinessCenterDto {
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  address?: string;
}