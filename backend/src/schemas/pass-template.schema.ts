import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PassTemplateDocument = HydratedDocument<PassTemplate>;

@Schema({ timestamps: true })
export class PassTemplate {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  createdBy: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ enum: ['manual', 'from_pass'], default: 'manual' })
  source: string;

  @Prop({ type: Types.ObjectId, ref: 'Pass' })
  sourcePassId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  visitorName: string;

  @Prop({ trim: true })
  visitorPhone?: string;

  @Prop({ trim: true })
  companyName?: string;

  @Prop({ trim: true })
  visitPurpose?: string;

  @Prop({ required: true })
  passType: string;

  @Prop({ trim: true })
  vehiclePlate?: string;

  @Prop({ trim: true })
  vehicleModel?: string;

  @Prop()
  visitTimeFrom?: string;

  @Prop()
  visitTimeTo?: string;

  @Prop({ type: Types.ObjectId, ref: 'Office' })
  officeId?: Types.ObjectId;

  @Prop({ trim: true })
  office?: string;

  @Prop({ trim: true })
  floor?: string;

  @Prop({ trim: true })
  businessCenterName?: string;

  @Prop({ trim: true })
  comment?: string;
}

export const PassTemplateSchema = SchemaFactory.createForClass(PassTemplate);

PassTemplateSchema.index(
  { createdBy: 1, visitorName: 1, passType: 1, officeId: 1 },
  { unique: true, partialFilterExpression: { officeId: { $exists: true } } },
);