import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from '../auth/auth.service';
import {
  CreateServiceRequestDto,
  TicketMessageDto,
  UpdateServiceRequestStatusDto,
} from './site-source.dto';
import { ServiceRequestActor, SiteSourceService } from './site-source.service';

@Controller('service-requests')
@UseGuards(AuthGuard('jwt'))
export class ServiceRequestsController {
  constructor(
    private readonly siteSourceService: SiteSourceService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  list(@Req() req: any) {
    const actor = this.actor(req.user);
    const canManage = this.canManage(req.user);
    this.assertCanRead(req.user, canManage);
    return this.siteSourceService.listTicketsForActor(actor, canManage);
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreateServiceRequestDto) {
    this.assertTenant(req.user);
    const profile = await this.authService.getServiceRequestIdentity(
      String(req.user.userId),
    );
    return this.siteSourceService.createTicket(
      { ...this.actor(req.user), company: profile.company },
      { ...dto, office: profile.office },
    );
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: any) {
    const canManage = this.canManage(req.user);
    this.assertCanRead(req.user, canManage);
    return this.siteSourceService.getTicketForActor(
      id,
      this.actor(req.user),
      canManage,
    );
  }

  @Post(':id/messages')
  async addMessage(
    @Param('id') id: string,
    @Body() dto: TicketMessageDto,
    @Req() req: any,
  ) {
    const canManage = this.canManage(req.user);
    this.assertCanRead(req.user, canManage);
    await this.siteSourceService.getTicketForActor(
      id,
      this.actor(req.user),
      canManage,
    );
    return this.siteSourceService.addTicketMessage(
      id,
      dto.body,
      this.actor(req.user),
    );
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateServiceRequestStatusDto,
    @Req() req: any,
  ) {
    if (!this.canManage(req.user)) {
      throw new ForbiddenException(
        'Статус заявки может менять только администратор',
      );
    }
    return this.siteSourceService.updateTicketStatus(id, dto.status);
  }

  private canManage(user: any): boolean {
    return Boolean(
      ['bc_admin', 'admin'].includes(String(user?.role || '')) &&
      (user?.permissions?.includes('requests.manage') ||
        user?.permissions?.includes('admin.settings')),
    );
  }

  private isTenant(user: any): boolean {
    return Boolean(user?.role === 'tenant' || user?.parentTenantId);
  }

  private assertTenant(user: any) {
    if (
      !this.isTenant(user) ||
      (!user?.permissions?.includes('requests.create') &&
        !user?.permissions?.includes('passes.view_own'))
    ) {
      throw new ForbiddenException('Создание заявок недоступно');
    }
  }

  private assertCanRead(user: any, canManage: boolean) {
    if (
      !canManage &&
      (!this.isTenant(user) ||
        (!user?.permissions?.includes('requests.view_own') &&
          !user?.permissions?.includes('passes.view_own')))
    ) {
      throw new ForbiddenException('Просмотр заявок недоступен');
    }
  }

  private actor(user: any): ServiceRequestActor {
    return {
      userId: String(user.userId),
      parentTenantId: user.parentTenantId,
      email: user.email,
      fullName: user.fullName,
      company: user.company,
      role: user.role,
    };
  }
}
