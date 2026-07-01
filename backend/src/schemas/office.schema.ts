import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OfficeDocument = Office & Document;

@Schema({ timestamps: true, collection: 'offices' })
export class Office {
  @Prop({ type: Types.ObjectId, ref: 'Property', required: true, index: true })
  property: Types.ObjectId;

  @Prop({ required: true, trim: true })
  number: string;

  @Prop({ trim: true })
  floor?: string;

  @Prop()
  areaSqm?: number;

  @Prop({ trim: true })
  company?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  tenantId?: Types.ObjectId;

  @Prop({ default: true })
  isActive: boolean;
}

export const OfficeSchema = SchemaFactory.createForClass(Office);

OfficeSchema.index({ property: 1, number: 1 }, { unique: true });