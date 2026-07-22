import { IsBoolean } from 'class-validator';

export class SetTenantEmployeeActiveDto {
  @IsBoolean({ message: 'Укажите isActive: true или false' })
  isActive: boolean;
}
