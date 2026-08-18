// offices — pass24
// БЦ → офис → арендатор (tenantId, опционально)
// номер уникален внутри БЦ
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OfficeDocument = Office & Document;

@Schema({ timestamps: true, collection: 'offices' })
export class Office {
  @Prop({ type: Types.ObjectId, ref: 'Property', required: true, index: true })
  property: Types.ObjectId;

  // "401", "2-12" и т.п.
  @Prop({ required: true, trim: true })
  number: string;

  @Prop({ trim: true })
  floor?: string;

  @Prop()
  areaSqm?: number;

  @Prop({ trim: true })
  company?: string;

  // владелец компании (role=tenant), не сотрудник. Первый из tenantIds.
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  tenantId?: Types.ObjectId;

  /** Все арендаторы офиса, включая tenantId. */
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  tenantIds?: Types.ObjectId[];

  @Prop({ default: true })
  isActive: boolean;

  /** Ключ с сайта, напр. tf-room:107 */
  @Prop({ unique: true, sparse: true, trim: true })
  externalId?: string;

  /** Название с сайта (post_title). */
  @Prop({ trim: true })
  title?: string;

  /** busy | free — витрина сайта */
  @Prop({ trim: true })
  availability?: string;

  /** leased | available */
  @Prop({ trim: true })
  roomStatus?: string;

  /** standard | vip | design */
  @Prop({ trim: true })
  officeFormat?: string;

  /** Дата «занят до» с сайта, YYYY-MM-DD */
  @Prop({ trim: true })
  busyUntil?: string;

  /** paid | unpaid | overdue */
  @Prop({ trim: true })
  paymentStatus?: string;

  @Prop({ trim: true })
  paidUntil?: string;

  /** Чтобы не слать одно и то же уведомление каждый синк. */
  @Prop({ trim: true })
  lastNotifiedPayment?: string;
}

export const OfficeSchema = SchemaFactory.createForClass(Office);

OfficeSchema.index({ property: 1, number: 1 }, { unique: true });
OfficeSchema.index({ tenantIds: 1 });
