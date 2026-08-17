import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthDatabaseModule } from '../database/auth-database.module';
import { DatabaseModule } from '../database/database.module';
import { PassesModule } from '../passes/passes.module';
import { MstyleV2Module } from '../integrations/mstyle-v2/mstyle-v2.module';
import { SiteSourceModule } from '../site-source/site-source.module';
import { User, UserSchema } from '../schemas';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    DatabaseModule,
    DatabaseModule.forFeature(),
    AuthDatabaseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    AuthModule,
    PassesModule,
    MstyleV2Module,
    SiteSourceModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
