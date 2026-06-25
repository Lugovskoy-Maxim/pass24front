import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PropertyType } from './enums';

export type PropertyDocument = Property & Document;

@Schema({ timestamps: true, collection: 'properties' })
export class Property {
  @Prop({ required: true, trim: true })
  name: string; // Название объекта (ЖК "Солнечный", БЦ "Атриум" и т.д.)

  @Prop({ required: true, trim: true })
  address: string;

  @Prop({ enum: PropertyType, default: PropertyType.OTHER })
  type: PropertyType;

  @Prop({ unique: true, sparse: true })
  code?: string; // Внутренний код объекта

  @Prop({ type: [String], default: [] })
  gates: string[]; // Список КПП / шлагбаумов / ворот

  @Prop({ type: Object, default: {} })
  settings: Record<string, any>; 
  // Например: { autoApproveGuestPasses: false, requireApprovalForVehicles: true, parkingQuotas: {...} }

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Property' })
  parentProperty?: Types.ObjectId; // Для сложных объектов (несколько корпусов)

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  admins: Types.ObjectId[]; // Администраторы объекта
}

export const PropertySchema = SchemaFactory.createForClass(Property);

// Индексы
PropertySchema.index({ name: 'text', address: 'text' });
PropertySchema.index({ code: 1 });
PropertySchema.index({ isActive: 1 });
