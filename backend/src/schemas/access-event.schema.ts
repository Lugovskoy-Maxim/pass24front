import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { EventType } from './enums';

export type AccessEventDocument = AccessEvent & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'access_events' })
export class AccessEvent {
  @Prop({ type: Date, default: Date.now, index: true })
  timestamp: Date;

  @Prop({ required: true, enum: EventType, index: true })
  type: EventType;

  @Prop({ type: Types.ObjectId, ref: 'Property', required: true, index: true })
  property: Types.ObjectId;

  // Связанные сущности
  @Prop({ type: Types.ObjectId, ref: 'Pass' })
  pass?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'PassRequest' })
  passRequest?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Vehicle' })
  vehicle?: Types.ObjectId;

  @Prop({ uppercase: true, trim: true })
  vehiclePlate?: string;

  @Prop({ trim: true })
  guestName?: string;

  // Кто совершил действие (охрана, система, житель)
  @Prop({ type: Types.ObjectId, ref: 'User' })
  actor?: Types.ObjectId;

  @Prop({ trim: true })
  actorName?: string; // Для случаев, когда actor — внешняя система или охрана без аккаунта

  @Prop({ trim: true })
  gate?: string; // КПП / шлагбаум / вход

  @Prop({ trim: true })
  comment?: string;

  @Prop({ type: Object, default: {} })
  meta?: Record<string, any>; // Данные от камер, распознавания номеров, фото и т.д.
}

export const AccessEventSchema = SchemaFactory.createForClass(AccessEvent);

AccessEventSchema.index({ property: 1, timestamp: -1 });
AccessEventSchema.index({ type: 1, timestamp: -1 });
AccessEventSchema.index({ vehiclePlate: 1, timestamp: -1 });
AccessEventSchema.index({ pass: 1, timestamp: -1 });
AccessEventSchema.index({ actor: 1, timestamp: -1 });
