import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AccessConfigService } from '../access/access-config.service';
import { AppConfigService } from './app-config.service';

@Controller('config')
export class ConfigController {
  constructor(
    private readonly accessConfigService: AccessConfigService,
    private readonly appConfigService: AppConfigService,
  ) {}

  @Get()
  getConfig() {
    return this.appConfigService.getPublicConfig();
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