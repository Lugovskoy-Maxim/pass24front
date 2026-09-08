import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NativePushDeviceDocument = NativePushDevice & Document;

@Schema({ timestamps: true, collection: 'native_push_devices' })
export class NativePushDevice {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: ['firebase', 'rustore'] })
  provider: 'firebase' | 'rustore';

  @Prop({ required: true, unique: true })
  token: string;
}

export const NativePushDeviceSchema =
  SchemaFactory.createForClass(NativePushDevice);
NativePushDeviceSchema.index({ userId: 1, provider: 1 });
