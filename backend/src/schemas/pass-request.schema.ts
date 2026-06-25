import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PassRequestStatus, PassType } from './enums';

export type PassRequestDocument = PassRequest & Document;

@Schema({ timestamps: true, collection: 'pass_requests' })
export class PassRequest {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  requestedBy: Types.ObjectId; // Кто подал заявку (житель)

  @Prop({ type: Types.ObjectId, ref: 'Property', required: true, index: true })
  property: Types.ObjectId;

  @Prop({ required: true, enum: PassType })
  type: PassType;

  // Данные, которые хочет добавить заявитель
  @Prop({ trim: true })
  guestName?: string;

  @Prop({ trim: true })
  guestPhone?: string;

  @Prop({ uppercase: true, trim: true })
  vehiclePlate?: string;

  @Prop({ type: Date })
  desiredValidFrom?: Date;

  @Prop({ type: Date })
  desiredValidTo?: Date;

  @Prop({ trim: true })
  comment?: string;

  // Статус согласования
  @Prop({ enum: PassRequestStatus, default: PassRequestStatus.PENDING, index: true })
  status: PassRequestStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewedAt?: Date;

  @Prop({ trim: true })
  reviewComment?: string;

  // Если заявка одобрена — ссылка на созданный пропуск
  @Prop({ type: Types.ObjectId, ref: 'Pass' })
  pass?: Types.ObjectId;

  @Prop({ type: Object, default: {} })
  meta?: Record<string, any>;
}

export const PassRequestSchema = SchemaFactory.createForClass(PassRequest);

PassRequestSchema.index({ property: 1, status: 1, createdAt: -1 });
PassRequestSchema.index({ requestedBy: 1, createdAt: -1 });
PassRequestSchema.index({ vehiclePlate: 1 });
