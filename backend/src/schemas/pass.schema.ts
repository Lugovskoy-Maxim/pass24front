/**
 * Пропуск (БД pass24).
 * createdBy — id User из pass24_auth (логическая ссылка, без join между БД).
 * Список компании фильтруется по createdBy ∈ team (owner + employees).
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PassDocument = Pass & Document;

@Schema({ timestamps: true, collection: 'passes' })
export class Pass {
  @Prop({ required: true, unique: true })
  passNumber: string;

  /** Автор заявки (User._id). При удалении employee → переназначается owner. */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop()
  creatorName?: string;

  @Prop()
  creatorCompany?: string;

  @Prop()
  creatorPhone?: string;

  @Prop({ required: true, trim: true })
  visitorName: string;

  @Prop()
  visitorPhone?: string;

  @Prop()
  visitorPassportSeries?: string;

  @Prop({ index: true })
  visitorPassportNumber?: string;

  @Prop()
  visitorPassportIssuedBy?: string;

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
PassSchema.index({ visitorName: 'text', vehiclePlate: 'text', companyName: 'text', visitorPassportNumber: 'text' });
PassSchema.index({ visitorPhone: 1 });
PassSchema.index({ office: 1 });
PassSchema.index({ property: 1, visitDate: -1 });
PassSchema.index({ officeId: 1 });
PassSchema.index({ createdBy: 1 });
