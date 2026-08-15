import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PushSubscriptionDocument = PushSubscription & Document;

@Schema({ timestamps: true, collection: 'push_subscriptions' })
export class PushSubscription {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  endpoint: string;

  @Prop({ required: true, select: false })
  p256dh: string;

  @Prop({ required: true, select: false })
  auth: string;

  @Prop({ required: true, select: false, index: true })
  renewalTokenHash: string;

  @Prop()
  userAgent?: string;
}

export const PushSubscriptionSchema =
  SchemaFactory.createForClass(PushSubscription);
PushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });
