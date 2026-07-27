// properties — pass24 (БЦ / объекты)
// на них завязаны offices, охрана (users.properties), пропуска
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PropertyType } from './enums';

export type PropertyDocument = Property & Document;

@Schema({ timestamps: true, collection: 'properties' })
export class Property {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  address: string;

  // обычно business_center
  @Prop({ enum: PropertyType, default: PropertyType.OTHER })
  type: PropertyType;

  // внешний/внутренний код, удобно для синка
  @Prop({ unique: true, sparse: true })
  code?: string;

  @Prop({ type: [String], default: [] })
  gates: string[];

  @Prop({ type: Object, default: {} })
  settings: Record<string, any>;

  @Prop({ default: true })
  isActive: boolean;

  // если несколько корпусов
  @Prop({ type: Types.ObjectId, ref: 'Property' })
  parentProperty?: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  admins: Types.ObjectId[];
}

export const PropertySchema = SchemaFactory.createForClass(Property);

PropertySchema.index({ name: 'text', address: 'text' });
PropertySchema.index({ isActive: 1 });
