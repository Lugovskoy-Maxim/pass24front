/**
 * HTTP-слой auth: /api/auth/*
 * Публичные: login, register*, password-reset*, invite*.
 * JWT: me, profile, email/verify, tenant/employees*.
 */
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
  NotFoundException,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthGuard } from '@nestjs/passport';
import { IsInt, IsObject, Min } from 'class-validator';
import { AccessConfigService } from '../access/access-config.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { ConfirmEmailVerifyDto } from './dto/confirm-email-verify.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { ConfirmRegistrationDto } from './dto/confirm-registration.dto';
import { CreateTenantEmployeeDto } from './dto/create-tenant-employee.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { SetTenantEmployeeActiveDto } from './dto/set-tenant-employee-active.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateCompanyLogoDto } from './dto/update-company-logo.dto';
import { AUTH_CONNECTION } from '../database/auth-database.constants';
import { User, UserDocument } from '../schemas';
import { MstyleIdentityService } from '../integrations/mstyle-v2/mstyle-v2.identities';
import { MstyleDirectoryService } from '../integrations/mstyle-v2/mstyle-v2.directory.service';
import { MstylePrivateDataService } from '../integrations/mstyle-v2/mstyle-v2.private-data.service';
import {
  ChangeRequestDto,
  ResidentPatchPrivateDataDto,
} from '../integrations/mstyle-v2/mstyle-v2.dto';
import { MSTYLE_SCHEMA_VERSION } from '../integrations/mstyle-v2/mstyle-v2.constants';

class UpdateResidentRequisitesDto {
  @IsInt()
  @Min(0)
  expectedRevision: number;

  @IsObject()
  data: Record<string, unknown>;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accessConfigService: AccessConfigService,
    @InjectModel(User.name, AUTH_CONNECTION)
    private readonly users: Model<UserDocument>,
    private readonly identities: MstyleIdentityService,
    private readonly directory: MstyleDirectoryService,
    private readonly privateData: MstylePrivateDataService,
  ) {}

  private async ownerRequisites(userId: string) {
    const user = await this.users.findById(userId).select('+password');
    if (!user) throw new NotFoundException('Пользователь не найден');
    const identity = await this.identities.ensureFromUser(user);
    const profile = await this.identities.getAdminProfileState(user);
    if (!profile.exists || !profile.profileId)
      return { identity, profileId: null, requisites: null };
    return {
      identity,
      profileId: profile.profileId,
      requisites: await this.directory.ownerResidentRequisites(
        profile.profileId,
        identity.subject,
      ),
    };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('profile/requisites')
  async getResidentRequisites(@Req() req: any) {
    const { profileId, requisites } = await this.ownerRequisites(
      req.user.userId,
    );
    if (!profileId || !requisites) return { available: false };
    return { available: true, ...requisites };
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('profile/requisites')
  async updateResidentRequisites(
    @Req() req: any,
    @Body() dto: UpdateResidentRequisitesDto,
  ) {
    const { identity, profileId, requisites } = await this.ownerRequisites(
      req.user.userId,
    );
    if (!profileId || !requisites) return { available: false };
    if (dto.expectedRevision !== requisites.revision)
      throw new ConflictException(
        'Данные изменились. Обновите страницу и попробуйте снова',
      );
    if (requisites.editPolicy === 'request_only') {
      const change: ChangeRequestDto = {
        schemaVersion: MSTYLE_SCHEMA_VERSION,
        reasonCode: 'resident_profile_data_update',
        expectedPrivateDataRevision: requisites.revision,
        privateData: {
          profileType: requisites.profileType as 'individual' | 'company',
          legalForm: requisites.legalForm as 'ip' | 'ooo' | null,
          data: dto.data,
        },
      };
      const result = await this.directory.createChangeRequest(
        profileId,
        change,
        `profile-${requisites.profileRevision}`,
        identity.subject,
      );
      return result.body;
    }
    if (requisites.editPolicy !== 'self_service')
      throw new ConflictException('Редактирование реквизитов пока недоступно');
    const result = await this.privateData.patchResident(
      profileId,
      {
        schemaVersion: MSTYLE_SCHEMA_VERSION,
        privateData: {
          profileType: requisites.profileType as 'individual' | 'company',
          legalForm: requisites.legalForm as 'ip' | 'ooo' | null,
          data: dto.data,
        },
      } as ResidentPatchPrivateDataDto,
      `private-${requisites.revision}`,
    );
    return result.body;
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /** Публично: сведения о приглашении (без JWT). */
  @Get('invite/:token')
  getInviteInfo(@Param('token') token: string) {
    return this.authService.getInviteInfo(token);
  }

  /** Публично: задать пароль по invite-ссылке. */
  @Post('invite/accept')
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.authService.acceptInvite(dto);
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

  @Get('register/status/:registrationId')
  async getRegistrationStatus(@Param('registrationId') registrationId: string) {
    return this.authService.getRegistrationStatus(registrationId);
  }

  @Post('password-reset/request')
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('password-reset/confirm')
  async confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto) {
    return this.authService.confirmPasswordReset(dto);
  }

  @Get('password-reset/status/:resetToken')
  async getPasswordResetStatus(@Param('resetToken') resetToken: string) {
    return this.authService.getPasswordResetStatus(resetToken);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async me(@Req() req: any) {
    return this.authService.me(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('email/verify/request')
  async requestEmailVerification(@Req() req: any) {
    return this.authService.requestEmailVerification(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('email/verify/confirm')
  async confirmEmailVerification(
    @Req() req: any,
    @Body() dto: ConfirmEmailVerifyDto,
  ) {
    return this.authService.confirmEmailVerification(req.user.userId, dto);
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
  @Patch('company-logo')
  async updateCompanyLogo(@Req() req: any, @Body() dto: UpdateCompanyLogoDto) {
    return this.authService.updateCompanyLogo(req.user.userId, dto.companyLogo);
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
  @Post('tenant/employees/:id/resend-invite')
  resendTenantEmployeeInvite(@Req() req: any, @Param('id') id: string) {
    return this.authService.resendTenantEmployeeInvite(req.user.userId, id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('tenant/employees/:id')
  setTenantEmployeeActive(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SetTenantEmployeeActiveDto,
  ) {
    return this.authService.setTenantEmployeeActive(
      req.user.userId,
      id,
      dto.isActive,
    );
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
