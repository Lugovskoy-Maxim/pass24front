import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AppSettingsDocument = HydratedDocument<AppSettings>;

@Schema({ timestamps: true, collection: 'app_settings' })
export class AppSettings {
  @Prop({ required: true, unique: true, default: 'global' })
  key: string;

  @Prop({ default: 'PASS24' })
  siteName: string;

  @Prop({ default: '' })
  siteIcon: string;

  @Prop({ default: 'Пропуска для арендаторов бизнес-центра' })
  siteTagline: string;

  @Prop({ default: '+7 (495) 123-45-67' })
  sitePhone: string;

  @Prop({ default: 'info@pass24.local' })
  siteEmail: string;

  @Prop({ type: Object, default: {} })
  uiLabels: Record<string, unknown>;
}

export const AppSettingsSchema = SchemaFactory.createForClass(AppSettings);