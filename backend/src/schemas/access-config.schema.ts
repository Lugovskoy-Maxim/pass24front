import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AccessConfigDocument = AccessConfig & Document;

@Schema({ timestamps: true, collection: 'access_config' })
export class AccessConfig {
  @Prop({ required: true, unique: true, default: 'default' })
  key: string;

  @Prop({ type: [String], default: ['visitor', 'parking', 'delivery', 'contractor'] })
  enabledPassTypes: string[];

  @Prop({
    type: Object,
    default: {
      tenant: ['passes.create', 'passes.view_own'],
      security: ['passes.view_all', 'passes.approve', 'passes.reception', 'passes.lookup'],
      admin: [
        'passes.create',
        'passes.view_own',
        'passes.view_all',
        'passes.approve',
        'passes.reception',
        'passes.lookup',
        'admin.panel',
        'admin.users',
        'admin.offices',
        'admin.settings',
        'admin.permissions',
      ],
    },
  })
  rolePermissions: Record<string, string[]>;
}

export const AccessConfigSchema = SchemaFactory.createForClass(AccessConfig);