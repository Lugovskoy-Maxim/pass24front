import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequireAllPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { AccessConfigService } from '../access/access-config.service';
import { AdminService } from './admin.service';
import { CreateBusinessCenterDto } from './dto/create-business-center.dto';
import { CreateOfficeDto } from './dto/create-office.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateAccessConfigDto } from './dto/update-access-config.dto';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequireAllPermissions('admin.panel')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly accessConfigService: AccessConfigService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.adminService.dashboard();
  }

  @Post('seed-test-data')
  seedTestData() {
    return this.adminService.seedTestData();
  }

  @Get('access-config')
  @RequireAllPermissions('admin.permissions')
  getAccessConfig() {
    return this.accessConfigService.getConfig();
  }

  @Patch('access-config')
  @RequireAllPermissions('admin.permissions')
  updateAccessConfig(@Body() dto: UpdateAccessConfigDto) {
    return this.accessConfigService.updateConfig(dto);
  }

  @Get('users')
  @RequireAllPermissions('admin.users')
  getUsers(@Query() q: { role?: string; search?: string }) {
    return this.adminService.getUsers(q);
  }

  @Post('users')
  @RequireAllPermissions('admin.users')
  createUser(@Body() dto: CreateUserDto) {
    return this.adminService.createUser(dto);
  }

  @Patch('users/:id')
  @RequireAllPermissions('admin.users')
  updateUser(@Param('id') id: string, @Body() dto: Partial<CreateUserDto & { isActive: boolean }>) {
    return this.adminService.updateUser(id, dto);
  }

  @Get('business-centers')
  @RequireAllPermissions('admin.offices')
  getBusinessCenters() {
    return this.adminService.getBusinessCenters();
  }

  @Post('business-centers')
  @RequireAllPermissions('admin.offices')
  createBusinessCenter(@Body() dto: CreateBusinessCenterDto) {
    return this.adminService.createBusinessCenter(dto);
  }

  @Get('offices')
  @RequireAllPermissions('admin.offices')
  getOffices() {
    return this.adminService.getOffices();
  }

  @Post('offices')
  @RequireAllPermissions('admin.offices')
  createOffice(@Body() dto: CreateOfficeDto) {
    return this.adminService.createOffice(dto);
  }

  @Patch('offices/:id')
  @RequireAllPermissions('admin.offices')
  updateOffice(@Param('id') id: string, @Body() dto: Partial<CreateOfficeDto & { isActive: boolean }>) {
    return this.adminService.updateOffice(id, dto);
  }

  @Get('audit')
  getAudit(@Query('offset') offset = 0) {
    return { entries: [], total: 0, offset: Number(offset) };
  }

  @Get('settings')
  @RequireAllPermissions('admin.settings')
  async getSettings() {
    const { settings } = await this.adminService.dashboard();
    return { settings };
  }

  @Get('blacklist')
  @RequireAllPermissions('admin.settings')
  getBlacklist() {
    return { entries: [] };
  }

  @Get('reports/daily')
  getDailyReport(@Query('date') date?: string) {
    return { date: date || new Date().toISOString().slice(0, 10), summary: [], visitors: [] };
  }
}