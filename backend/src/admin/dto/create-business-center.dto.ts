import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateBusinessCenterDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  address: string;

  @IsOptional()
  @IsString()
  code?: string;
}