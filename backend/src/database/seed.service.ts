import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas';
import { UserRole } from '../schemas/enums';
import { TestDataSeedService } from './test-data-seed.service';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private configService: ConfigService,
    private testDataSeedService: TestDataSeedService,
  ) {}

  async onModuleInit() {
    await this.seedAdminUser();
    await this.seedDevTestData();
  }

  private async seedAdminUser() {
    const email = this.configService.get<string>('ADMIN_EMAIL', 'admin@pass24.local').toLowerCase();
    const password = this.configService.get<string>('ADMIN_PASSWORD', 'admin123');
    const fullName = this.configService.get<string>('ADMIN_FULL_NAME', 'Администратор БЦ');
    const role = this.configService.get<string>('ADMIN_ROLE', UserRole.ADMIN);

    const existing = await this.userModel.findOne({ email });
    if (existing) {
      this.logger.log(`Admin user already exists: ${email}`);
      return;
    }

    const hashed = await bcrypt.hash(password, 10);
    await this.userModel.create({
      email,
      fullName,
      role,
      password: hashed,
      isActive: true,
    } as any);

    this.logger.log(`Admin user created: ${email}`);
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