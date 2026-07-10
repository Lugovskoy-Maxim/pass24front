import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TenantEmployeeCategoryDocument = TenantEmployeeCategory & Document;

@Schema({ timestamps: true, collection: 'tenant_employee_categories' })
export class TenantEmployeeCategory {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerTenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop({ default: false })
  isDefault: boolean;
}

export const TenantEmployeeCategorySchema = SchemaFactory.createForClass(TenantEmployeeCategory);

TenantEmployeeCategorySchema.index({ ownerTenantId: 1, name: 1 }, { unique: true });