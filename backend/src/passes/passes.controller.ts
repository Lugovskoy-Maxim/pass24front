import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PassesService } from './passes.service';
import { CreatePassDto } from './dto/create-pass.dto';
import { PassExportQueryDto } from './dto/pass-export-query.dto';
import { PassHistoryQueryDto } from './dto/pass-history-query.dto';
import { SendPassEmailDto } from './dto/send-pass-email.dto';
import { UpdatePassVisitorDto } from './dto/update-pass-visitor.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Controller('passes')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class PassesController {
  constructor(private readonly passesService: PassesService) {}

  @Get()
  @RequirePermissions('passes.view_own', 'passes.view_all', 'admin.panel')
  findAll(
    @Query() query: { status?: string; date?: string; search?: string; limit?: string; offset?: string },
    @Req() req: any,
  ) {
    return this.passesService.findAll(query, req.user);
  }

  @Get('journal')
  @RequirePermissions('passes.reception', 'passes.view_all', 'admin.panel')
  getJournal(
    @Query('date') date?: string,
    @Query('search') search?: string,
    /** all=1 — журнал по всем БЦ; иначе только БЦ охранника/bc_admin */
    @Query('all') all?: string,
    @Req() req?: any,
  ) {
    return this.passesService.getJournal(date, req?.user, search, {
      allProperties: all === '1' || all === 'true',
    });
  }

  @Get('stats')
  @RequirePermissions('passes.view_own', 'passes.view_all', 'admin.panel')
  getStats(@Req() req: any) {
    return this.passesService.getStats(req.user);
  }

  @Get('overdue-active')
  @RequirePermissions('passes.reception', 'passes.view_all', 'admin.panel')
  getOverdueActive(@Query('all') all?: string, @Req() req?: any) {
    return this.passesService.getOverdueActive(req.user, {
      allProperties: all === '1' || all === 'true',
    });
  }

  @Get('history')
  @RequirePermissions('passes.view_all', 'passes.reception', 'admin.panel')
  getHistory(@Query() query: PassHistoryQueryDto, @Req() req: any) {
    return this.passesService.getHistory(query, req.user);
  }

  @Get('export-filters')
  @RequirePermissions('passes.view_own', 'passes.view_all', 'admin.panel')
  getExportFilters(@Req() req: any) {
    return this.passesService.getExportFilters(req.user);
  }

  @Get('report')
  @RequirePermissions('passes.view_own', 'passes.view_all', 'admin.panel')
  getReport(@Query() query: PassExportQueryDto, @Req() req: any) {
    return this.passesService.findReport(query, req.user);
  }

  @Get('export')
  @RequirePermissions('passes.view_own', 'passes.view_all', 'admin.panel')
  async exportPasses(@Query() query: PassExportQueryDto, @Req() req: any, @Res() res: Response) {
    const csv = await this.passesService.exportCsv(query, req.user);
    const datePart = query.dateFrom && query.dateTo
      ? `${query.dateFrom}_${query.dateTo}`
      : query.date || new Date().toISOString().slice(0, 10);
    const filename = `passes-${datePart}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(`\uFEFF${csv}`, 'utf-8'));
  }

  @Get('lookup/:passNumber')
  @RequirePermissions('passes.lookup', 'passes.reception', 'admin.panel')
  lookup(@Param('passNumber') passNumber: string, @Req() req: any) {
    return this.passesService.lookup(passNumber, req.user);
  }

  @Get(':id')
  @RequirePermissions('passes.view_own', 'passes.view_all', 'admin.panel')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.passesService.findOne(id, req.user);
  }

  @Post()
  @RequirePermissions('passes.create')
  create(@Body() dto: CreatePassDto, @Req() req: any) {
    return this.passesService.create(dto, req.user);
  }

  @Patch(':id/status')
  @RequirePermissions('passes.approve', 'passes.create', 'passes.reception')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto, @Req() req: any) {
    return this.passesService.updateStatus(id, dto, req.user);
  }

  @Patch(':id/visitor-data')
  @RequirePermissions('passes.reception', 'passes.approve', 'admin.panel')
  updateVisitorData(@Param('id') id: string, @Body() dto: UpdatePassVisitorDto, @Req() req: any) {
    return this.passesService.updateVisitorData(id, dto, req.user);
  }

  @Post(':id/send-email')
  @HttpCode(200)
  @RequirePermissions('passes.create', 'passes.view_own', 'passes.view_all')
  sendEmail(@Param('id') id: string, @Body() dto: SendPassEmailDto, @Req() req: any) {
    return this.passesService.sendPassEmail(id, dto.email, req.user);
  }

  @Post(':id/check-in')
  @RequirePermissions('passes.reception', 'admin.panel')
  checkIn(@Param('id') id: string, @Req() req: any) {
    return this.passesService.checkIn(id, req.user);
  }

  @Post(':id/check-out')
  @RequirePermissions('passes.reception', 'admin.panel')
  checkOut(@Param('id') id: string, @Req() req: any) {
    return this.passesService.checkOut(id, req.user);
  }
}