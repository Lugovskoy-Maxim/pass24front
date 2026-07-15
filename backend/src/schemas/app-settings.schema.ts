import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AppSettingsDocument = HydratedDocument<AppSettings>;

@Schema({ timestamps: true, collection: 'app_settings' })
export class AppSettings {
  @Prop({ required: true, unique: true, default: 'global' })
  key: string;

  @Prop({ default: 'M-STYLE' })
  siteName: string;

  @Prop({ default: '/brand/mstyle-logo-light.svg' })
  siteIcon: string;

  /** Логотип для светлой темы (тёмный знак на светлом фоне) */
  @Prop({ default: '/brand/mstyle-logo-light.svg' })
  siteIconLight: string;

  /** Логотип для тёмной темы (светлый знак на тёмном фоне) */
  @Prop({ default: '/brand/mstyle-logo.svg' })
  siteIconDark: string;

  @Prop({ default: 'Пропуска для арендаторов бизнес-центра' })
  siteTagline: string;

  @Prop({ default: '+7 495 663-00-00' })
  sitePhone: string;

  @Prop({ default: 'renta@mstyle.ru' })
  siteEmail: string;

  /** image — картинка (siteIcon), text — текстовый знак (brandMarkText) */
  @Prop({ default: 'image' })
  brandMarkType: string;

  @Prop({ default: 'M' })
  brandMarkText: string;

  @Prop({ default: true })
  brandShowName: boolean;

  @Prop({ default: true })
  brandNameBeforeMark: boolean;

  /** Имя иконки Lucide для выпадающих списков */
  @Prop({ default: 'chevron-down' })
  uiIconSelectChevron: string;

  @Prop({ default: '#eb711c' })
  themePrimary: string;

  @Prop({ default: '#d55700' })
  themePrimaryHover: string;

  @Prop({ type: Object, default: {} })
  uiLabels: Record<string, unknown>;

  /** Регистрация арендаторов по SMS (код на телефон) */
  @Prop({ default: true })
  smsRegistrationEnabled: boolean;

  @Prop({ default: 'Скоро функция будет работать' })
  smsRegistrationDisabledMessage: string;

  @Prop({ default: 'Код подтверждения регистрации: {code}. Действует 15 минут.' })
  smsRegistrationCodeText: string;
}

export const AppSettingsSchema = SchemaFactory.createForClass(AppSettings);