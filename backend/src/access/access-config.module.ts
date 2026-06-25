import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessConfig, AccessConfigSchema } from '../schemas/access-config.schema';
import { AccessConfigService } from './access-config.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: AccessConfig.name, schema: AccessConfigSchema }]),
  ],
  providers: [AccessConfigService],
  exports: [AccessConfigService],
})
export class AccessConfigModule {}