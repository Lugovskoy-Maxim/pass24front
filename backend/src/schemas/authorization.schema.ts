import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuthorizationDocument = Authorization & Document;

/**
 * Доверенность — право оформлять пропуска за другого человека/компанию.
 * Используется для управляющих, родственников, сотрудников компаний-арендаторов.
 */
@Schema({ timestamps: true, collection: 'authorizations' })
export class Authorization {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  principal: Types.ObjectId; // Владелец права (кому дали доверенность)

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  grantedTo: Types.ObjectId; // Кто получил право оформлять

  @Prop({ type: Types.ObjectId, ref: 'Property', required: true })
  property: Types.ObjectId;

  @Prop({ trim: true })
  description?: string; // "Доверенность на пропуска для сотрудников ООО Ромашка"

  @Prop({ type: Date })
  validFrom?: Date;

  @Prop({ type: Date })
  validTo?: Date;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: [String], default: [] })
  allowedPassTypes?: string[]; // Можно ограничить только vehicle или pedestrian
}

export const AuthorizationSchema = SchemaFactory.createForClass(Authorization);

AuthorizationSchema.index({ grantedTo: 1, property: 1, isActive: 1 });
AuthorizationSchema.index({ principal: 1 });
