import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { Office, OfficeDocument, Property, PropertyDocument, User, UserDocument } from '../schemas';
import { PropertyType } from '../schemas/enums';
import { AUTH_CONNECTION } from './auth-database.constants';
import { DEV_TEST_ACCOUNTS } from './dev-test-accounts';

export interface TestDataSeedResult {
  message: string;
  businessCenters: number;
  offices: number;
  users: number;
  skipped: boolean;
}

@Injectable()
export class TestDataSeedService {
  private readonly logger = new Logger(TestDataSeedService.name);

  constructor(
    @InjectModel(User.name, AUTH_CONNECTION) private userModel: Model<UserDocument>,
    @InjectModel(Property.name) private propertyModel: Model<PropertyDocument>,
    @InjectModel(Office.name) private officeModel: Model<OfficeDocument>,
  ) {}

  async seedTestData(): Promise<TestDataSeedResult> {
    const result: TestDataSeedResult = {
      message: '',
      businessCenters: 0,
      offices: 0,
      users: 0,
      skipped: true,
    };

    const bcData = [
      { name: 'БЦ Атриум', address: 'ул. Тверская, 12', code: 'atrium' },
      { name: 'БЦ Сити Плаза', address: 'Пресненская наб., 8', code: 'city-plaza' },
    ];

    const bcMap = new Map<string, PropertyDocument>();
    for (const bc of bcData) {
      let property = await this.propertyModel.findOne({ code: bc.code });
      if (!property) {
        property = await this.propertyModel.create({
          ...bc,
          type: PropertyType.BUSINESS_CENTER,
          isActive: true,
          settings: {},
          gates: ['Главный вход', 'Парковка P1'],
        });
        result.businessCenters++;
        result.skipped = false;
      }
      bcMap.set(bc.code, property);
    }

    const propertyIds = [...bcMap.values()].map((property) => property._id);

    const tenantAccount = DEV_TEST_ACCOUNTS.find((account) => account.role === 'tenant')!;
    let tenantUser = await this.userModel.findOne({ email: tenantAccount.email });
    if (!tenantUser) {
      tenantUser = await this.userModel.create({
        email: tenantAccount.email,
        fullName: tenantAccount.fullName,
        company: tenantAccount.company,
        role: tenantAccount.role,
        password: await bcrypt.hash(tenantAccount.password, 10),
        isActive: true,
        office: tenantAccount.office,
        floor: tenantAccount.floor,
      } as any);
      result.users++;
      result.skipped = false;
    }

    const tenantOffices = [
      { bc: 'atrium', number: '401', floor: '4', areaSqm: 85, company: tenantAccount.company },
      { bc: 'city-plaza', number: '1201', floor: '12', areaSqm: 120, company: tenantAccount.company },
    ];

    for (const officeSpec of tenantOffices) {
      const property = bcMap.get(officeSpec.bc)!;
      const exists = await this.officeModel.findOne({
        property: property._id,
        number: officeSpec.number,
      });
      if (!exists) {
        await this.officeModel.create({
          property: property._id,
          number: officeSpec.number,
          floor: officeSpec.floor,
          areaSqm: officeSpec.areaSqm,
          company: officeSpec.company,
          tenantId: tenantUser!._id,
          isActive: true,
        });
        result.offices++;
        result.skipped = false;
      } else if (!exists.tenantId) {
        exists.tenantId = tenantUser!._id;
        exists.company = officeSpec.company;
        await exists.save();
      }
    }

    await this.syncTenantProperties(tenantUser!._id.toString());

    for (const account of DEV_TEST_ACCOUNTS) {
      if (account.role === 'tenant') continue;

      const existing = await this.userModel.findOne({ email: account.email });
      if (existing) continue;

      await this.userModel.create({
        email: account.email,
        fullName: account.fullName,
        role: account.role,
        password: await bcrypt.hash(account.password, 10),
        isActive: true,
        ...(account.role === 'security' || account.role === 'bc_admin'
          ? { properties: propertyIds }
          : {}),
      } as any);
      result.users++;
      result.skipped = false;
    }

    result.message = result.skipped
      ? 'Тестовые данные уже существуют'
      : 'Тестовые учётки и данные созданы';

    if (!result.skipped) {
      this.logger.log(result.message);
    }

    return result;
  }

  private async syncTenantProperties(tenantId: string) {
    const offices = await this.officeModel
      .find({ tenantId: new Types.ObjectId(tenantId), isActive: true })
      .lean();
    const propertyIds = [...new Set(offices.map((office) => office.property.toString()))];
    const primary = offices[0];

    await this.userModel.findByIdAndUpdate(tenantId, {
      properties: propertyIds.map((id) => new Types.ObjectId(id)),
      ...(primary
        ? { office: primary.number, floor: primary.floor, company: primary.company }
        : {}),
    });
  }
}