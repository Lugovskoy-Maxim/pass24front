/**
 * Админ API: /api/admin/*
 * Guard: JWT + PermissionsGuard; класс требует admin.panel,
 * методы — @RequireAllPermissions('admin.users'|offices|settings|…).
 *
 * site-settings: SMS-поля может менять только role===admin (см. updateSiteSettings).
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
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
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateAccessConfigDto } from './dto/update-access-config.dto';
import { UpdateBusinessCenterDto } from './dto/update-business-center.dto';

import { UpdateSiteSettingsDto } from './dto/update-site-settings.dto';
import { SiteSettingsService } from '../site-settings/site-settings.service';
import { SiteSourceService } from '../site-source/site-source.service';
import {
  ConfirmLinksDto,
  ConfirmSuggestedDto,
  PushOfficeDto,
  TicketMessageDto,
  UnlinkDto,
  UpdateSiteSourceDto,
} from '../site-source/site-source.dto';
import {
  MSTYLE_V2_CATALOG,
  mstyleCatalogMeta,
} from '../integrations/mstyle-v2/mstyle-v2.catalog';
import { MstyleV2Config } from '../integrations/mstyle-v2/mstyle-v2.config';
import { UpdateMstyleIntegrationSettingsDto } from './dto/update-mstyle-integration-settings.dto';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequireAllPermissions('admin.panel')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly accessConfigService: AccessConfigService,
    private readonly auditService: AuditService,
    private readonly siteSettingsService: SiteSettingsService,
    private readonly siteSourceService: SiteSourceService,
    private readonly mstyleV2Config: MstyleV2Config,
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
  async updateAccessConfig(
    @Body() dto: UpdateAccessConfigDto,
    @Req() req: any,
  ) {
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
        roles: dto.rolePermissions
          ? Object.keys(dto.rolePermissions)
          : undefined,
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
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: any,
  ) {
    return this.adminService.updateUser(id, dto, req.user);
  }

  @Delete('users/:id')
  @RequireAllPermissions('admin.users')
  deleteUser(@Param('id') id: string, @Req() req: any) {
    return this.adminService.deleteUser(id, req.user);
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
  updateBusinessCenter(
    @Param('id') id: string,
    @Body() dto: UpdateBusinessCenterDto,
    @Req() req: any,
  ) {
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
  updateOffice(
    @Param('id') id: string,
    @Body() dto: Partial<CreateOfficeDto & { isActive: boolean }>,
    @Req() req: any,
  ) {
    return this.adminService.updateOffice(id, dto, req.user);
  }

  @Delete('offices/:id')
  @RequireAllPermissions('admin.offices')
  deleteOffice(@Param('id') id: string, @Req() req: any) {
    return this.adminService.deleteOffice(id, req.user);
  }

  @Get('audit/export')
  async exportAudit(
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    const csv = await this.adminService.exportAuditCsv(
      this.parseAuditQuery(query),
    );
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

  @Get('site-source')
  @RequireAllPermissions('admin.settings')
  getSiteSource() {
    return this.siteSourceService.getPublicConfig();
  }

  @Patch('site-source')
  @RequireAllPermissions('admin.settings')
  async updateSiteSource(@Body() dto: UpdateSiteSourceDto, @Req() req: any) {
    const settings = await this.siteSourceService.saveConfig(dto);
    await this.auditService.log({
      action: 'site_source.update',
      entityType: 'app_settings',
      actor: req.user,
      details: { host: settings.host, database: settings.database },
    });
    return { settings };
  }

  @Post('site-source/test')
  @RequireAllPermissions('admin.settings')
  testSiteSource() {
    return this.siteSourceService.testConnection();
  }

  @Post('site-source/offices/import')
  @RequireAllPermissions('admin.settings')
  importSiteOffices(@Req() req: any) {
    return this.siteSourceService.importOffices().then(async (result) => {
      await this.auditService.log({
        action: 'site_source.offices_import',
        entityType: 'office',
        actor: req.user,
        details: result,
      });
      return result;
    });
  }

  @Get('site-source/links')
  @RequireAllPermissions('admin.settings')
  listSiteLinks() {
    return this.siteSourceService.listLinks();
  }

  @Post('site-source/links/confirm')
  @RequireAllPermissions('admin.settings')
  confirmSiteLinks(@Body() dto: ConfirmLinksDto, @Req() req: any) {
    return this.siteSourceService.confirmLinks(dto).then(async (result) => {
      await this.auditService.log({
        action: 'site_source.links_confirm',
        entityType: 'app_settings',
        actor: req.user,
        details: result,
      });
      return result;
    });
  }

  @Post('site-source/links/confirm-suggested')
  @RequireAllPermissions('admin.settings')
  confirmSuggestedLinks(@Body() dto: ConfirmSuggestedDto, @Req() req: any) {
    return this.siteSourceService.confirmSuggested(dto).then(async (result) => {
      await this.auditService.log({
        action: 'site_source.links_suggested',
        entityType: 'app_settings',
        actor: req.user,
        details: result,
      });
      return result;
    });
  }

  @Post('site-source/links/unlink')
  @RequireAllPermissions('admin.settings')
  unlinkSite(@Body() dto: UnlinkDto) {
    return this.siteSourceService.unlink(dto);
  }

  @Post('site-source/offices/sync-linked')
  @RequireAllPermissions('admin.settings')
  syncLinkedOffices(@Req() req: any) {
    return this.siteSourceService.syncLinked().then(async (result) => {
      await this.auditService.log({
        action: 'site_source.sync_linked',
        entityType: 'office',
        actor: req.user,
        details: result,
      });
      return result;
    });
  }

  @Post('site-source/offices/:id/push')
  @RequireAllPermissions('admin.settings')
  pushOffice(
    @Param('id') id: string,
    @Body() dto: PushOfficeDto,
    @Req() req: any,
  ) {
    return this.siteSourceService.pushOffice(id, dto).then(async (result) => {
      await this.auditService.log({
        action: 'site_source.office_push',
        entityType: 'office',
        entityId: id,
        actor: req.user,
        details: result,
      });
      return result;
    });
  }

  @Get('site-source/check')
  @RequireAllPermissions('admin.settings')
  checkSiteSource() {
    return this.siteSourceService.checkSource();
  }

  @Get('site-source/tickets')
  @RequireAllPermissions('admin.settings')
  listSiteTickets() {
    return this.siteSourceService.listTickets();
  }

  @Get('site-source/tickets/:id')
  @RequireAllPermissions('admin.settings')
  getSiteTicket(@Param('id') id: string) {
    return this.siteSourceService.getTicket(id);
  }

  @Post('site-source/tickets/:id/messages')
  @RequireAllPermissions('admin.settings')
  addSiteTicketMessage(@Param('id') id: string, @Body() dto: TicketMessageDto) {
    return this.siteSourceService.addTicketMessage(id, dto.body);
  }

  @Get('integration/catalog')
  @RequireAllPermissions('admin.settings')
  async integrationCatalog() {
    const environmentDefault =
      this.mstyleV2Config.mockResponsesDefaultEnabled();
    const mockMode =
      await this.siteSettingsService.getMstyleMockResponsesEnabled(
        environmentDefault,
      );
    return {
      meta: {
        ...mstyleCatalogMeta(),
        mockResponsesEnabled: mockMode.enabled,
        mockResponsesOverridden: mockMode.overridden,
        mockResponsesEnvironmentDefault: environmentDefault,
      },
      endpoints: MSTYLE_V2_CATALOG,
    };
  }

  @Patch('integration/mock-mode')
  @RequireAllPermissions('admin.settings')
  async updateIntegrationMockMode(
    @Body() dto: UpdateMstyleIntegrationSettingsDto,
    @Req() req: any,
  ) {
    const mockResponsesEnabled =
      await this.siteSettingsService.setMstyleMockResponsesEnabled(
        dto.mockResponsesEnabled,
      );
    await this.auditService.log({
      action: 'integration.mock_mode.update',
      entityType: 'app_settings',
      actor: req.user,
      details: { mockResponsesEnabled },
    });
    return { mockResponsesEnabled };
  }

  @Get('site-settings')
  @RequireAllPermissions('admin.settings')
  async getSiteSettings() {
    const settings = await this.siteSettingsService.get();
    return { settings };
  }

  @Patch('site-settings')
  @RequireAllPermissions('admin.settings')
  async updateSiteSettings(
    @Body() dto: UpdateSiteSettingsDto,
    @Req() req: any,
  ) {
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
      delete payload.blockedEmailDomains;
      delete payload.registrationNotifyEmails;
      delete payload.registrationNotifyUserIds;
    }
    const settings = await this.siteSettingsService.update(payload);
    await this.auditService.log({
      action: 'site_settings.update',
      entityType: 'app_settings',
      actor: req.user,
      details: { siteName: settings.siteName, appVersion: settings.appVersion },
    });
    return { settings };
  }

  @Get('reports/daily')
  getDailyReport(@Query('date') date?: string) {
    return {
      date: date || new Date().toISOString().slice(0, 10),
      summary: [],
      visitors: [],
    };
  }
}
