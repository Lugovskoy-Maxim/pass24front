import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { PassTemplatesController } from './pass-templates.controller';
import { PassTemplatesService } from './pass-templates.service';
import { PassesController } from './passes.controller';
import { PassesService } from './passes.service';

@Module({
  imports: [DatabaseModule.forFeature(), AuthModule],
  controllers: [PassesController, PassTemplatesController],
  providers: [PassesService, PassTemplatesService],
  exports: [PassesService, PassTemplatesService],
})
export class PassesModule {}
