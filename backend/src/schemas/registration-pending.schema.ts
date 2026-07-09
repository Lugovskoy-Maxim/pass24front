import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RegistrationPendingDocument = HydratedDocument<RegistrationPending>;

@Schema({ timestamps: true, collection: 'registration_pending' })
export class RegistrationPending {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  codeHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ trim: true })
  lastName?: string;

  @Prop({ trim: true })
  firstName?: string;

  @Prop({ trim: true })
  middleName?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ required: true, trim: true })
  company: string;
}

export const RegistrationPendingSchema = SchemaFactory.createForClass(RegistrationPending);

RegistrationPendingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });