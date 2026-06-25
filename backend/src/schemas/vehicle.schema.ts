import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VehicleDocument = Vehicle & Document;

@Schema({ timestamps: true, collection: 'vehicles' })
export class Vehicle {
  @Prop({ required: true, uppercase: true, trim: true, index: true })
  plateNumber: string; // Нормализованный номер: "A123BC77"

  @Prop({ trim: true })
  brand?: string;

  @Prop({ trim: true })
  model?: string;

  @Prop({ trim: true })
  color?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  ownerUser?: Types.ObjectId; // Постоянный владелец (житель/сотрудник)

  @Prop({ trim: true })
  ownerName?: string; // Для гостевых авто

  @Prop({ type: Types.ObjectId, ref: 'Property' })
  property?: Types.ObjectId; // Если машина привязана к конкретному объекту

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Object })
  meta?: Record<string, any>;
}

export const VehicleSchema = SchemaFactory.createForClass(Vehicle);

VehicleSchema.index({ plateNumber: 1 });
VehicleSchema.index({ plateNumber: 1, property: 1 }, { unique: false });
VehicleSchema.index({ ownerUser: 1 });
