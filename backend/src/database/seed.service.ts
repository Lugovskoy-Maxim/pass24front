import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Connection, Model } from 'mongoose';
import { AUTH_CONNECTION } from './auth-database.constants';
import { User, UserDocument } from '../schemas';
import { UserRole } from '../schemas/enums';
import { TestDataSeedService } from './test-data-seed.service';

/**
 * Старт приложения: одноразовая миграция users, супер-админ, dev-seed.
 * Не путать с TestDataSeedService (тестовые tenant/security/admin@pass24.local).
 */
@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(User.name, AUTH_CONNECTION) private userModel: Model<UserDocument>,
    @InjectConnection() private mainConnection: Connection,
    private configService: ConfigService,
    private testDataSeedService: TestDataSeedService,
  ) {}

  async onModuleInit() {
    await this.migrateUsersFromMainDbIfNeeded();
    await this.seedAdminUser();
    await this.seedDevTestData();
  }

  /**
   * LEGACY-миграция: users раньше жили в pass24; при пустой auth-БД копируем.
   * Безопасно на новых установках (authCount > 0 → skip).
   */
  private async migrateUsersFromMainDbIfNeeded() {
    const authCount = await this.userModel.estimatedDocumentCount();
    if (authCount > 0) return;

    const mainDb = this.mainConnection.db;
    if (!mainDb) return;

    const legacyUsers = await mainDb.collection('users').find({}).toArray();
    if (!legacyUsers.length) return;

    try {
      await this.userModel.insertMany(legacyUsers, { ordered: false });
      this.logger.log(`Мигрировано ${legacyUsers.length} пользователей в auth-базу (pass24_auth)`);
    } catch (err) {
      this.logger.warn(`Миграция users в auth-базу: ${(err as Error).message}`);
    }
  }

  private async seedAdminUser() {
    const username = this.configService.get<string>('ADMIN_USERNAME', 'admin').toLowerCase();
    const password = this.configService.get<string>('ADMIN_PASSWORD', '01.03.1986');
    const fullName = this.configService.get<string>('ADMIN_FULL_NAME', 'Админ');
    const role = this.configService.get<string>('ADMIN_ROLE', UserRole.ADMIN);
    const legacyEmail = this.configService.get<string>('ADMIN_EMAIL', '')?.trim().toLowerCase();

    const existing = await this.userModel.findOne({
      $or: [
        { username },
        ...(legacyEmail ? [{ email: legacyEmail }] : []),
      ],
    });
    if (existing) {
      this.logger.log(`Супер-администратор уже существует: ${existing.username || existing.email}`);
      return;
    }

    const hashed = await bcrypt.hash(password, 10);
    await this.userModel.create({
      username,
      fullName,
      role,
      password: hashed,
      isActive: true,
      emailVerified: !!legacyEmail,
      ...(legacyEmail ? { email: legacyEmail } : {}),
    } as any);

    this.logger.log(`Супер-администратор создан: ${username} (роль: ${role})`);
  }

  private async seedDevTestData() {
    const seedEnabled = this.configService.get<string>(
      'SEED_DEV_DATA',
      process.env.NODE_ENV === 'production' ? 'false' : 'true',
    );

    if (seedEnabled === 'false') {
      return;
    }

    await this.testDataSeedService.seedTestData();
  }
}