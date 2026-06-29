import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AppSettingsDocument = HydratedDocument<AppSettings>;

@Schema({ timestamps: true, collection: 'app_settings' })
export class AppSettings {
  @Prop({ required: true, unique: true, default: 'global' })
  key: string;

  @Prop({ default: 'M-STYLE' })
  siteName: string;

  @Prop({ default: '/brand/mstyle-logo.svg' })
  siteIcon: string;

  @Prop({ default: 'Пропуска для арендаторов бизнес-центра' })
  siteTagline: string;

  @Prop({ default: '+7 495 663-00-00' })
  sitePhone: string;

  @Prop({ default: 'renta@mstyle.ru' })
  siteEmail: string;

  @Prop({ type: Object, default: {} })
  uiLabels: Record<string, unknown>;
}

export const AppSettingsSchema = SchemaFactory.createForClass(AppSettings);