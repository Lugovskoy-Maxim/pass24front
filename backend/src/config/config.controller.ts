import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AccessConfigService } from '../access/access-config.service';

@Controller('config')
export class ConfigController {
  constructor(private readonly accessConfigService: AccessConfigService) {}

  @Get()
  getConfig() {
    return {
      businessCenterName: 'БЦ PASS24',
      workingHoursFrom: '08:00',
      workingHoursTo: '20:00',
      contactPhone: '+7 (495) 123-45-67',
      contactEmail: 'info@pass24.local',
      receptionFloor: '1',
      maxPassesPerDay: 200,
    };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('access')
  async getAccessConfig(@Req() req: any) {
    const config = await this.accessConfigService.getConfig();
    const permissions = await this.accessConfigService.getPermissionsForRole(req.user.role);
    return {
      enabledPassTypes: config.enabledPassTypes,
      passTypeLabels: config.passTypeLabels,
      permissions,
      rolePermissions: config.rolePermissions,
    };
  }
}