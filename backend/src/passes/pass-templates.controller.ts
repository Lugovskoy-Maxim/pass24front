import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CreatePassTemplateDto } from './dto/create-pass-template.dto';
import { PassTemplatesService } from './pass-templates.service';

@Controller('pass-templates')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class PassTemplatesController {
  constructor(private readonly templatesService: PassTemplatesService) {}

  @Get()
  @RequirePermissions('passes.templates')
  findAll(@Req() req: any) {
    return this.templatesService.findAll(req.user);
  }

  @Post()
  @RequirePermissions('passes.templates')
  create(@Body() dto: CreatePassTemplateDto, @Req() req: any) {
    return this.templatesService.create(dto, req.user);
  }

  @Post('sync-from-passes')
  @RequirePermissions('passes.templates')
  syncFromPasses(@Req() req: any) {
    return this.templatesService.syncFromPasses(req.user);
  }

  @Post('from-pass/:passId')
  @RequirePermissions('passes.templates')
  createFromPass(@Param('passId') passId: string, @Req() req: any, @Body() body?: { name?: string }) {
    return this.templatesService.createFromPass(passId, req.user, body?.name);
  }

  @Get(':id')
  @RequirePermissions('passes.templates')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.templatesService.findOne(id, req.user);
  }

  @Patch(':id')
  @RequirePermissions('passes.templates')
  update(@Param('id') id: string, @Body() dto: Partial<CreatePassTemplateDto>, @Req() req: any) {
    return this.templatesService.update(id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermissions('passes.templates')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.templatesService.remove(id, req.user);
  }
}