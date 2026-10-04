import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequireAllPermissions } from '../auth/permissions.decorator';
import { OfficeServicesService } from './office-services.service';

@Controller('office-services')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class OfficeServicesController {
  constructor(private readonly service: OfficeServicesService) {}
  @Get('categories') categories() {
    return this.service.categories();
  }
  @Post('admin/categories')
  @RequireAllPermissions('admin.panel', 'admin.offices')
  category(@Body() body: any, @Req() req: any) {
    return this.service.saveCategory(body, req.user);
  }
  @Get('admin/prices')
  @RequireAllPermissions('admin.panel', 'admin.offices')
  prices(@Req() req: any) {
    return this.service.prices(req.user);
  }
  @Post('admin/prices')
  @RequireAllPermissions('admin.panel', 'admin.offices')
  addPrice(@Body() body: any, @Req() req: any) {
    return this.service.savePrice(null, body, req.user);
  }
  @Patch('admin/prices/:id')
  @RequireAllPermissions('admin.panel', 'admin.offices')
  price(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.service.savePrice(id, body, req.user);
  }
  @Get('admin/offices/:id')
  @RequireAllPermissions('admin.panel', 'admin.offices')
  adminOffice(@Param('id') id: string, @Req() req: any) {
    return this.service.adminOffice(id, req.user);
  }
  @Patch('admin/offices/:id')
  @RequireAllPermissions('admin.panel', 'admin.offices')
  saveOffice(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.service.saveOffice(id, body, req.user);
  }
  @Get('offices/:id')
  tenantOffice(@Param('id') id: string, @Req() req: any) {
    return this.service.tenantOffice(id, req.user);
  }
}
