import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PassesController } from './passes.controller';
import { PassesService } from './passes.service';

@Module({
  imports: [DatabaseModule.forFeature()],
  controllers: [PassesController],
  providers: [PassesService],
  exports: [PassesService],
})
export class PassesModule {}
