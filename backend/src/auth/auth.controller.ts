import { Body, Controller, Delete, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('dev-accounts')
  getDevAccounts() {
    return this.authService.getDevAccounts();
  }

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
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
}
