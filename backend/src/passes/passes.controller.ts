import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PassesService } from './passes.service';
import { CreatePassDto } from './dto/create-pass.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Controller('passes')
export class PassesController {
  constructor(private readonly passesService: PassesService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get()
  findAll(@Query() query: { status?: string; date?: string; search?: string }) {
    return this.passesService.findAll(query);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('journal')
  getJournal(@Query('date') date?: string) {
    return this.passesService.getJournal(date);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('stats')
  getStats() {
    return this.passesService.getStats();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('lookup/:passNumber')
  lookup(@Param('passNumber') passNumber: string) {
    return this.passesService.lookup(decodeURIComponent(passNumber));
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.passesService.findOne(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(@Body() dto: CreatePassDto, @Req() req: any) {
    return this.passesService.create(dto, req.user);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto, @Req() req: any) {
    return this.passesService.updateStatus(id, dto, req.user);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/check-in')
  checkIn(@Param('id') id: string) {
    return this.passesService.checkIn(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/check-out')
  checkOut(@Param('id') id: string) {
    return this.passesService.checkOut(id);
  }
}
