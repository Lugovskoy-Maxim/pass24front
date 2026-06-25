import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PassesService } from './passes.service';
import { CreatePassDto } from './dto/create-pass.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Controller('passes')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class PassesController {
  constructor(private readonly passesService: PassesService) {}

  @Get()
  @RequirePermissions('passes.view_own', 'passes.view_all')
  findAll(@Query() query: { status?: string; date?: string; search?: string }, @Req() req: any) {
    return this.passesService.findAll(query, req.user);
  }

  @Get('journal')
  @RequirePermissions('passes.reception', 'passes.view_all')
  getJournal(@Query('date') date?: string, @Req() req?: any) {
    return this.passesService.getJournal(date, req?.user);
  }

  @Get('stats')
  @RequirePermissions('passes.view_own', 'passes.view_all')
  getStats(@Req() req: any) {
    return this.passesService.getStats(req.user);
  }

  @Get('lookup/:passNumber')
  @RequirePermissions('passes.lookup', 'passes.reception')
  lookup(@Param('passNumber') passNumber: string) {
    return this.passesService.lookup(passNumber);
  }

  @Get(':id')
  @RequirePermissions('passes.view_own', 'passes.view_all')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.passesService.findOne(id, req.user);
  }

  @Post()
  @RequirePermissions('passes.create')
  create(@Body() dto: CreatePassDto, @Req() req: any) {
    return this.passesService.create(dto, req.user);
  }

  @Patch(':id/status')
  @RequirePermissions('passes.approve')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto, @Req() req: any) {
    return this.passesService.updateStatus(id, dto, req.user);
  }

  @Post(':id/check-in')
  @RequirePermissions('passes.reception')
  checkIn(@Param('id') id: string) {
    return this.passesService.checkIn(id);
  }

  @Post(':id/check-out')
  @RequirePermissions('passes.reception')
  checkOut(@Param('id') id: string) {
    return this.passesService.checkOut(id);
  }
}