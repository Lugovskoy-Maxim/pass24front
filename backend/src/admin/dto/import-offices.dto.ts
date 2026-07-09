import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ImportOfficesDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2_000_000)
  csv: string;
}