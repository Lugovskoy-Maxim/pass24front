import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { Property, PropertySchema } from '../schemas/property.schema';
import { AppConfigService } from './app-config.service';
import { ConfigController } from './config.controller';

@Module({
  imports: [DatabaseModule.forFeatureOnly([{ name: Property.name, schema: PropertySchema }])],
  controllers: [ConfigController],
  providers: [AppConfigService],
})
export class ConfigModule {}
