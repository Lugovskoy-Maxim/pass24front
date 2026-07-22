/**
 * Пользователь (БД pass24_auth, collection users).
 *
 * Ключевые поля:
 * - parentTenantId — сотрудник компании-арендатора (ссылка на owner)
 * - isActive — false: pending-арендатор после регистрации ИЛИ отключённый сотрудник
 * - emailVerified — подтверждение email кодом
 * - password* / emailVerify* — OTP-поля (select:false у хэшей)
 *
 * bitrix24* — заготовка под будущую интеграцию, сейчас почти не используется.
 */
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

  /** true после OTP на email (регистрация по почте / verify / password reset). */
  @Prop({ default: false })
  emailVerified: boolean;

  @Prop({ select: false })
  password?: string;

  /** OTP сброса пароля (select:false). */
  @Prop({ select: false })
  passwordResetCodeHash?: string;

  @Prop()
  passwordResetExpiresAt?: Date;

  @Prop()
  passwordResetLastSentAt?: Date;

  /** OTP подтверждения email из профиля. */
  @Prop({ select: false })
  emailVerifyCodeHash?: string;

  @Prop()
  emailVerifyExpiresAt?: Date;

  @Prop()
  emailVerifyLastSentAt?: Date;

  /** tenant | security | bc_admin | admin | tenant_employee | кастом из access_config */
  @Prop({ type: String, default: 'tenant' })
  role: string;

  /** БЦ для security/bc_admin (ObjectId Property). */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Property' }], default: [] })
  properties: Types.ObjectId[];

  /** @deprecated LEGACY: квартира; в B2B-модели офисов почти не используется. */
  @Prop({ trim: true })
  apartment?: string;

  /** @deprecated LEGACY: строковый офис; предпочтительно offices через Office.tenantId. */
  @Prop({ trim: true })
  office?: string;

  @Prop({ trim: true })
  floor?: string;

  @Prop({ trim: true })
  company?: string;

  @Prop({ type: Object, default: {} })
  meta: Record<string, any>;

  /**
   * tenant owner: false до одобрения админом.
   * employee: false = отключён владельцем.
   */
  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isBlocked: boolean;

  @Prop()
  lastLoginAt?: Date;

  /** Заготовка под push; сейчас не используется активно. */
  @Prop({ type: [{ type: String }], default: [] })
  pushTokens: string[];

  /** FUTURE: интеграция Bitrix24. */
  @Prop({ trim: true, sparse: true })
  bitrix24UserId?: string;

  @Prop({ trim: true, lowercase: true })
  bitrix24Domain?: string;

  @Prop({ type: Object, default: null })
  bitrix24Meta?: Record<string, unknown> | null;

  /** Ссылка на User-owner для сотрудника компании. */
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
