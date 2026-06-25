import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PassDocument = Pass & Document;

@Schema({ timestamps: true, collection: 'passes' })
export class Pass {
  @Prop({ required: true, unique: true })
  passNumber: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop()
  creatorName?: string;

  @Prop()
  creatorCompany?: string;

  @Prop({ required: true, trim: true })
  visitorName: string;

  @Prop()
  visitorPhone?: string;

  @Prop()
  companyName?: string;

  @Prop()
  visitPurpose?: string;

  @Prop({ required: true, index: true })
  passType: string; // visitor | parking | delivery | contractor

  @Prop({ required: true, index: true })
  status: string;

  @Prop({ uppercase: true, trim: true })
  vehiclePlate?: string;

  @Prop()
  vehicleModel?: string;

  @Prop({ required: true })
  visitDate: string; // YYYY-MM-DD

  @Prop()
  visitTimeFrom?: string;

  @Prop()
  visitTimeTo?: string;

  @Prop({ type: Types.ObjectId, ref: 'Property', index: true })
  property?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Office' })
  officeId?: Types.ObjectId;

  @Prop()
  businessCenterName?: string;

  @Prop({ required: true })
  office: string;

  @Prop()
  floor?: string;

  @Prop()
  comment?: string;

  // Workflow fields
  @Prop()
  approvedBy?: string;

  @Prop()
  approverName?: string;

  @Prop()
  approvedAt?: string;

  @Prop()
  rejectionReason?: string;

  @Prop()
  checkedInAt?: string;

  @Prop()
  checkedInBy?: string;

  @Prop()
  checkerInName?: string;

  @Prop()
  checkedOutAt?: string;

  @Prop()
  checkedOutBy?: string;

  @Prop()
  checkerOutName?: string;

  @Prop({ type: Object, default: {} })
  meta?: Record<string, any>;
}

export const PassSchema = SchemaFactory.createForClass(Pass);

PassSchema.index({ status: 1, visitDate: -1 });
PassSchema.index({ visitorName: 'text', vehiclePlate: 'text', companyName: 'text' });
PassSchema.index({ office: 1 });
PassSchema.index({ property: 1, visitDate: -1 });
PassSchema.index({ officeId: 1 });
PassSchema.index({ createdBy: 1 });
