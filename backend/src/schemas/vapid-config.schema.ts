import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type VapidConfigDocument = VapidConfig & Document;

@Schema({ timestamps: true, collection: 'vapid_config' })
export class VapidConfig {
  @Prop({ required: true, unique: true, default: 'default' })
  key: string;

  @Prop({ required: true })
  publicKey: string;

  @Prop({ required: true, select: false })
  privateKey: string;

  @Prop({ required: true })
  subject: string;
}

export const VapidConfigSchema = SchemaFactory.createForClass(VapidConfig);
