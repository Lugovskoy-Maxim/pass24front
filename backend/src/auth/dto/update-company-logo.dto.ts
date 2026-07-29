import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCompanyLogoDto {
  /** URL или data:image; пустая строка — удалить логотип. */
  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  companyLogo?: string;
}
