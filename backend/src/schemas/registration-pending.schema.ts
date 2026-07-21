import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RegistrationPendingDocument = HydratedDocument<RegistrationPending>;

@Schema({ timestamps: true, collection: 'registration_pending' })
export class RegistrationPending {
  @Prop({ lowercase: true, trim: true, sparse: true, unique: true })
  email?: string;

  @Prop({ trim: true, sparse: true, unique: true })
  phone?: string;

  @Prop({ required: true, enum: ['email', 'phone'] })
  verificationChannel: 'email' | 'phone';

  @Prop({ required: true, select: false })
  codeHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  /** Когда последний раз отправляли код (для rate limit SMS) */
  @Prop()
  lastCodeSentAt?: Date;

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

  @Prop({ required: true, trim: true })
  company: string;
}

export const RegistrationPendingSchema = SchemaFactory.createForClass(RegistrationPending);

RegistrationPendingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });