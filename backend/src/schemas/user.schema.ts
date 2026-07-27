// users — pass24_auth
//
// role:
//   tenant           — владелец компании, офисы через offices.tenantId
//   tenant_employee  — сотрудник, parentTenantId = owner
//   security         — охрана/ресепшн, properties = список БЦ
//   bc_admin         — админ БЦ, properties = список БЦ
//   admin            — супер-админ
//
// office/floor — просто копия из offices (удобно показывать, не редактировать руками)
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

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

  @Prop({ select: false })
  emailVerifyCodeHash?: string;

  @Prop()
  emailVerifyExpiresAt?: Date;

  @Prop()
  emailVerifyLastSentAt?: Date;

  // tenant | security | bc_admin | admin | tenant_employee | ...
  @Prop({ type: String, default: 'tenant' })
  role: string;

  // БЦ для security/bc_admin
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Property' }], default: [] })
  properties: Types.ObjectId[];

  // копия основного офиса (см. offices)
  @Prop({ trim: true })
  office?: string;

  @Prop({ trim: true })
  floor?: string;

  @Prop({ trim: true })
  company?: string;

  // сюда можно класть externalId и прочее для синка
  @Prop({ type: Object, default: {} })
  meta: Record<string, any>;

  // false = не одобрен / выключен / ждёт invite
  @Prop({ default: true })
  isActive: boolean;

  // сотрудник приглашён, но пароль ещё не поставил
  @Prop({ default: false })
  invitePending: boolean;

  @Prop({ select: false })
  inviteTokenHash?: string;

  @Prop()
  inviteExpiresAt?: Date;

  @Prop()
  inviteLastSentAt?: Date;

  @Prop({ default: false })
  isBlocked: boolean;

  @Prop()
  lastLoginAt?: Date;

  // сотрудник → owner
  @Prop({ type: Types.ObjectId, ref: 'User' })
  parentTenantId?: Types.ObjectId;

  // заявка на смену профиля (апрувит админ)
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
UserSchema.index({ parentTenantId: 1 });
