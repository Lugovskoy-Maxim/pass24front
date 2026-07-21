import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserRole } from './enums';

export type UserDocument = User & Document;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ unique: true, sparse: true, trim: true })
  phone?: string;

  @Prop({ trim: true })
  fullName?: string;

  @Prop({ trim: true })
  lastName?: string;

  @Prop({ trim: true })
  firstName?: string;

  @Prop({ trim: true })
  middleName?: string;

  @Prop({ trim: true, lowercase: true, unique: true, sparse: true })
  username?: string;

  @Prop({ trim: true, lowercase: true, unique: true, sparse: true })
  email?: string;

  /** Email подтверждён кодом при регистрации (или задан админом) */
  @Prop({ default: false })
  emailVerified: boolean;

  @Prop({ select: false })
  password?: string;

  @Prop({ select: false })
  passwordResetCodeHash?: string;

  @Prop()
  passwordResetExpiresAt?: Date;

  @Prop()
  passwordResetLastSentAt?: Date;

  @Prop({ type: String, default: 'tenant' })
  role: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Property' }], default: [] })
  properties: Types.ObjectId[]; // К каким объектам привязан пользователь

  @Prop({ trim: true })
  apartment?: string;

  @Prop({ trim: true })
  office?: string;

  @Prop({ trim: true })
  floor?: string;

  @Prop({ trim: true })
  company?: string;

  @Prop({ type: Object, default: {} })
  meta: Record<string, any>; // Доп. данные (например, companyName для юр.лиц)

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isBlocked: boolean; // Персональная блокировка (как в описаниях системы)

  @Prop()
  lastLoginAt?: Date;

  @Prop({ type: [{ type: String }], default: [] })
  pushTokens: string[]; // Для мобильных уведомлений

  /** Bitrix24 user ID — для будущей интеграции с приложением заявок */
  @Prop({ trim: true, sparse: true })
  bitrix24UserId?: string;

  /** Домен портала Bitrix24 (например, company.bitrix24.ru) */
  @Prop({ trim: true, lowercase: true })
  bitrix24Domain?: string;

  @Prop({ type: Object, default: null })
  bitrix24Meta?: Record<string, unknown> | null;

  /** Владелец компании-арендатора (для сотрудников, заказывающих пропуска от лица компании) */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  parentTenantId?: Types.ObjectId;

  @Prop({ type: Object, default: null })
  profileChangeRequest?: {
    lastName?: string;
    firstName?: string;
    middleName?: string;
    fullName?: string;
    phone?: string;
    company?: string;
    requestedAt?: Date;
  } | null;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ username: 1 }, { unique: true, sparse: true });
UserSchema.index({ properties: 1 });
UserSchema.index({ role: 1, isActive: 1 });
UserSchema.index({ fullName: 'text' });
UserSchema.index({ bitrix24UserId: 1, bitrix24Domain: 1 }, { unique: true, sparse: true });
UserSchema.index({ parentTenantId: 1 });
