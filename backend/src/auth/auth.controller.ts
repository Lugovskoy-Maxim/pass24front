import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AccessConfigService } from '../access/access-config.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ConfirmRegistrationDto } from './dto/confirm-registration.dto';
import { CreateTenantEmployeeDto } from './dto/create-tenant-employee.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accessConfigService: AccessConfigService,
  ) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('dev-accounts')
  getDevAccounts() {
    return this.authService.getDevAccounts();
  }

  @Post('register/request-code')
  async requestRegistrationCode(@Body() dto: RegisterDto) {
    return this.authService.requestRegistrationCode(dto);
  }

  @Post('register/confirm')
  async confirmRegistration(@Body() dto: ConfirmRegistrationDto) {
    return this.authService.confirmRegistration(dto);
  }

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.requestRegistrationCode(dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async me(@Req() req: any) {
    return this.authService.me(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('profile')
  async requestProfileChange(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.authService.requestProfileChange(req.user.userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('profile/request')
  async cancelProfileChange(@Req() req: any) {
    return this.authService.cancelProfileChange(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('tenant/employees')
  listTenantEmployees(@Req() req: any) {
    return this.authService.listTenantEmployees(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('tenant/employees')
  addTenantEmployee(@Req() req: any, @Body() dto: CreateTenantEmployeeDto) {
    return this.authService.addTenantEmployee(req.user.userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('tenant/employees/:id')
  removeTenantEmployee(@Req() req: any, @Param('id') id: string) {
    return this.authService.removeTenantEmployee(req.user.userId, id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('tenant/employee-roles')
  listEmployeeRoles() {
    return this.accessConfigService.getEmployeeAssignableRoles();
  }
}