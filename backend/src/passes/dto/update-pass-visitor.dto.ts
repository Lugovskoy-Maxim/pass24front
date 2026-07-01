import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePassVisitorDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  visitorPassportSeries?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  visitorPassportNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  visitorPassportIssuedBy?: string;
}