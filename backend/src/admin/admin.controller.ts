/**
 * Админ API: /api/admin/*
 * Guard: JWT + PermissionsGuard; класс требует admin.panel,
 * методы — @RequireAllPermissions('admin.users'|offices|settings|…).
 *
 * site-settings: SMS-поля может менять только role===admin (см. updateSiteSettings).
 */
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuditQuery } from '../audit/audit.service';
import { AuthGuard } from '@nestjs/passport';
import { RequireAllPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { AccessConfigService } from '../access/access-config.service';
import { AuditService } from '../audit/audit.service';
import { AdminService } from './admin.service';
import { CreateBusinessCenterDto } from './dto/create-business-center.dto';
import { CreateOfficeDto } from './dto/create-office.dto';
import { ImportOfficesDto } from './dto/import-offices.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateAccessConfigDto } from './dto/update-access-config.dto';
import { UpdateBusinessCenterDto } from './dto/update-business-center.dto';

import { UpdateSiteSettingsDto } from './dto/update-site-settings.dto';
import { SiteSettingsService } from '../site-settings/site-settings.service';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequireAllPermissions('admin.panel')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly accessConfigService: AccessConfigService,
    private readonly auditService: AuditService,
    private readonly siteSettingsService: SiteSettingsService,
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
  async updateAccessConfig(@Body() dto: UpdateAccessConfigDto, @Req() req: any) {
    if (dto.rolePermissions) {
      const current = await this.accessConfigService.getConfig();
      const nextRoles = new Set(Object.keys(dto.rolePermissions));
      const removedRoles = current.roles.filter((role) => !nextRoles.has(role));
      await this.adminService.assertRolesDeletable(removedRoles);
    }
    const result = await this.accessConfigService.updateConfig(dto);
    await this.auditService.log({
      action: 'permissions.update',
      entityType: 'access_config',
      actor: req.user,
      details: {
        enabledPassTypes: dto.enabledPassTypes,
        roles: dto.rolePermissions ? Object.keys(dto.rolePermissions) : undefined,
      },
    });
    return result;
  }

  @Get('users')
  @RequireAllPermissions('admin.users')
  getUsers(@Query() q: Record<string, string>) {
    return this.adminService.getUsers({
      category: q.category as 'tenants' | 'staff' | undefined,
      role: q.role,
      search: q.search,
      isActive: q.isActive,
      propertyId: q.propertyId,
      officeId: q.officeId,
    });
  }

  @Post('users')
  @RequireAllPermissions('admin.users')
  createUser(@Body() dto: CreateUserDto, @Req() req: any) {
    return this.adminService.createUser(dto, req.user);
  }

  @Patch('users/:id')
  @RequireAllPermissions('admin.users')
  updateUser(@Param('id') id: string, @Body() dto: Partial<CreateUserDto & { isActive: boolean }>, @Req() req: any) {
    return this.adminService.updateUser(id, dto, req.user);
  }

  @Get('registration-requests')
  @RequireAllPermissions('admin.users')
  getRegistrationRequests() {
    return this.adminService.getRegistrationRequests();
  }

  @Post('users/:id/registration/approve')
  @RequireAllPermissions('admin.users')
  approveRegistration(@Param('id') id: string, @Req() req: any) {
    return this.adminService.approveRegistration(id, req.user);
  }

  @Post('users/:id/registration/reject')
  @RequireAllPermissions('admin.users')
  rejectRegistration(@Param('id') id: string, @Req() req: any) {
    return this.adminService.rejectRegistration(id, req.user);
  }

  @Get('profile-change-requests')
  @RequireAllPermissions('admin.users')
  getProfileChangeRequests() {
    return this.adminService.getProfileChangeRequests();
  }

  @Post('users/:id/profile-change/approve')
  @RequireAllPermissions('admin.users')
  approveProfileChange(@Param('id') id: string, @Req() req: any) {
    return this.adminService.approveProfileChange(id, req.user);
  }

  @Post('users/:id/profile-change/reject')
  @RequireAllPermissions('admin.users')
  rejectProfileChange(@Param('id') id: string, @Req() req: any) {
    return this.adminService.rejectProfileChange(id, req.user);
  }

  @Get('business-centers')
  @RequireAllPermissions('admin.offices')
  getBusinessCenters(@Req() req: any) {
    return this.adminService.getBusinessCenters(req.user);
  }

  @Patch('business-centers/:id')
  @RequireAllPermissions('admin.offices')
  updateBusinessCenter(@Param('id') id: string, @Body() dto: UpdateBusinessCenterDto, @Req() req: any) {
    return this.adminService.updateBusinessCenter(id, dto, req.user);
  }

  @Post('business-centers')
  @RequireAllPermissions('admin.offices')
  createBusinessCenter(@Body() dto: CreateBusinessCenterDto, @Req() req: any) {
    return this.adminService.createBusinessCenter(dto, req.user);
  }

  @Delete('business-centers/:id')
  @RequireAllPermissions('admin.offices')
  deleteBusinessCenter(@Param('id') id: string, @Req() req: any) {
    return this.adminService.deleteBusinessCenter(id, req.user);
  }

  @Get('offices')
  @RequireAllPermissions('admin.offices')
  getOffices() {
    return this.adminService.getOffices();
  }

  @Get('offices/export')
  @RequireAllPermissions('admin.offices')
  async exportOffices(@Res() res: Response) {
    const csv = await this.adminService.exportOfficesCsv();
    const filename = `offices-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(`\uFEFF${csv}`, 'utf-8'));
  }

  @Post('offices/import')
  @RequireAllPermissions('admin.offices')
  importOffices(@Body() dto: ImportOfficesDto, @Req() req: any) {
    return this.adminService.importOfficesCsv(dto.csv, req.user);
  }

  @Post('offices')
  @RequireAllPermissions('admin.offices')
  createOffice(@Body() dto: CreateOfficeDto, @Req() req: any) {
    return this.adminService.createOffice(dto, req.user);
  }

  @Patch('offices/:id')
  @RequireAllPermissions('admin.offices')
  updateOffice(@Param('id') id: string, @Body() dto: Partial<CreateOfficeDto & { isActive: boolean }>, @Req() req: any) {
    return this.adminService.updateOffice(id, dto, req.user);
  }

  @Delete('offices/:id')
  @RequireAllPermissions('admin.offices')
  deleteOffice(@Param('id') id: string, @Req() req: any) {
    return this.adminService.deleteOffice(id, req.user);
  }

  @Get('audit/export')
  async exportAudit(@Query() query: Record<string, string>, @Res() res: Response) {
    const csv = await this.adminService.exportAuditCsv(this.parseAuditQuery(query));
    const filename = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(`\uFEFF${csv}`, 'utf-8'));
  }

  @Get('audit')
  getAudit(@Query() query: Record<string, string>) {
    return this.adminService.getAudit(this.parseAuditQuery(query));
  }

  private parseAuditQuery(query: Record<string, string>): AuditQuery {
    return {
      offset: query.offset !== undefined ? Number(query.offset) : undefined,
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      action: query.action,
      entityType: query.entityType,
      userId: query.userId,
      search: query.search,
    };
  }

  @Get('site-settings')
  @RequireAllPermissions('admin.settings')
  async getSiteSettings() {
    const settings = await this.siteSettingsService.get();
    return { settings };
  }

  @Patch('site-settings')
  @RequireAllPermissions('admin.settings')
  async updateSiteSettings(@Body() dto: UpdateSiteSettingsDto, @Req() req: any) {
    const payload: Parameters<SiteSettingsService['update']>[0] = {
      ...dto,
      faqItems: dto.faqItems?.map((item) => ({
        id: item.id,
        question: item.question,
        answer: item.answer,
      })),
      helpGuideSections: dto.helpGuideSections?.map((item) => ({
        id: item.id,
        title: item.title,
        steps: item.steps,
        paragraphs: item.paragraphs,
      })),
    };
    if (req.user?.role !== 'admin') {
      delete payload.smsRegistrationEnabled;
      delete payload.smsRegistrationDisabledMessage;
      delete payload.smsRegistrationCodeText;
    }
    const settings = await this.siteSettingsService.update(payload);
    await this.auditService.log({
      action: 'site_settings.update',
      entityType: 'app_settings',
      actor: req.user,
      details: { siteName: settings.siteName },
    });
    return { settings };
  }

  @Get('reports/daily')
  getDailyReport(@Query('date') date?: string) {
    return { date: date || new Date().toISOString().slice(0, 10), summary: [], visitors: [] };
  }
}