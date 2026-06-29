import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateStatusDto {
  @IsString()
  @IsIn(['pending', 'approved', 'rejected', 'active', 'completed', 'expired', 'cancelled'])
  status: string;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
