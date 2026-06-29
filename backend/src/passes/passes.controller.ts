import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PassesService } from './passes.service';
import { CreatePassDto } from './dto/create-pass.dto';
import { SendPassEmailDto } from './dto/send-pass-email.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Controller('passes')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class PassesController {
  constructor(private readonly passesService: PassesService) {}

  @Get()
  @RequirePermissions('passes.view_own', 'passes.view_all', 'admin.panel')
  findAll(@Query() query: { status?: string; date?: string; search?: string }, @Req() req: any) {
    return this.passesService.findAll(query, req.user);
  }

  @Get('journal')
  @RequirePermissions('passes.reception', 'passes.view_all', 'admin.panel')
  getJournal(@Query('date') date?: string, @Req() req?: any) {
    return this.passesService.getJournal(date, req?.user);
  }

  @Get('stats')
  @RequirePermissions('passes.view_own', 'passes.view_all', 'admin.panel')
  getStats(@Req() req: any) {
    return this.passesService.getStats(req.user);
  }

  @Get('overdue-active')
  @RequirePermissions('passes.reception', 'passes.view_all', 'admin.panel')
  getOverdueActive(@Req() req: any) {
    return this.passesService.getOverdueActive(req.user);
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
  @RequirePermissions('passes.approve', 'passes.create')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto, @Req() req: any) {
    return this.passesService.updateStatus(id, dto, req.user);
  }

  @Post(':id/send-email')
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