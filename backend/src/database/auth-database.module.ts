import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AUTH_CONNECTION } from './auth-database.constants';

function resolveAuthUri(configService: ConfigService): string {
  const explicit = configService.get<string>('MONGODB_AUTH_URI');
  if (explicit) return explicit;

  const mainUri = configService.get<string>('MONGODB_URI') || 'mongodb://localhost:27017/pass24';
  const match = mainUri.match(/^(mongodb(?:\+srv)?:\/\/[^/]+)(\/[^/?]+)?(\?.*)?$/);
  if (!match) return 'mongodb://localhost:27017/pass24_auth';

  const base = match[1];
  const query = match[3] || '';
  return `${base}/pass24_auth${query}`;
}

@Module({
  imports: [
    MongooseModule.forRootAsync({
      connectionName: AUTH_CONNECTION,
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const uri = resolveAuthUri(configService);
        console.log(`🔐 Connecting to Auth MongoDB at: ${uri.replace(/:[^:]*@/, ':****@')}`);
        return {
          uri,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
        };
      },
      inject: [ConfigService],
    }),
  ],
  exports: [MongooseModule],
})
export class AuthDatabaseModule {
  static forFeature(models: { name: string; schema: unknown }[]): DynamicModule {
    return MongooseModule.forFeature(models, AUTH_CONNECTION);
  }
}