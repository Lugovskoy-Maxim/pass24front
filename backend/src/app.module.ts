import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { PassesModule } from './passes/passes.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule as AppConfigModule } from './config/config.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: (env: Record<string, string>) => {
        if (!env.MONGODB_URI) {
          console.warn('⚠️  MONGODB_URI not set — using default or will fail at runtime');
        }
        return env;
      },
    }),
    DatabaseModule,
    AuthModule,
    PassesModule,
    AppConfigModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
