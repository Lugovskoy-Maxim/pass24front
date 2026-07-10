import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TenantEmployeePositionDocument = TenantEmployeePosition & Document;

@Schema({ timestamps: true, collection: 'tenant_employee_positions' })
export class TenantEmployeePosition {
  @Prop({ required: true, trim: true, unique: true })
  name: string;

  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop({ default: false })
  isDefault: boolean;
}

export const TenantEmployeePositionSchema = SchemaFactory.createForClass(TenantEmployeePosition);