import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  SetMetadata,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequireAllPermissions } from '../auth/permissions.decorator';
import {
  MstyleEnabledGuard,
  type MstyleRequest,
  MstyleRequestGuard,
  MstyleRouteContextGuard,
  MstyleServiceTokenGuard,
  REQUIRE_REQUEST_ID,
} from '../integrations/mstyle-v2/mstyle-v2.http';
import { membershipIsEffective } from '../integrations/mstyle-v2/mstyle-v2.membership-policy';
import { ProblemException } from '../integrations/mstyle-v2/mstyle-v2.problem';
import { OperationsStore } from './operations.store';
import { OperationsIdentity } from './operations.identity';
import { OperationsSupport } from './operations.support';
import { OperationsBookings } from './operations.bookings';
import { OperationsPayments } from './operations.payments';
import { OperationsHours } from './operations.hours';
import {
  bookingNeedsAction,
  fail,
  integer,
  normalizeSegments,
  OperationsActor,
  supportNeedsAction,
} from './operations.rules';

@Catch()
export class OperationsExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Retry-After', '10');
    if (error instanceof ProblemException)
      return response
        .status(error.getStatus())
        .json(
          error.toBody(host.switchToHttp().getRequest().mstyleRequestId || ''),
        );
    if (error instanceof HttpException)
      return response.status(error.getStatus()).json(error.getResponse());
    return response.status(503).json({
      ok: false,
      error: {
        code: 'service_unavailable',
        message: 'Сервис временно недоступен. Повторите позже.',
      },
    });
  }
}
@Controller('admin')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequireAllPermissions('admin.panel')
@UseFilters(OperationsExceptionFilter)
export class OperationsAdminController {
  constructor(
    readonly store: OperationsStore,
    readonly identity: OperationsIdentity,
    readonly support: OperationsSupport,
    readonly bookings: OperationsBookings,
    readonly payments: OperationsPayments,
    readonly hours: OperationsHours,
  ) {}
  @Get('work-queue/counts')
  @Header('Cache-Control', 'no-store')
  async counts(@Req() req: any) {
    const permissions: string[] = req.user.permissions || [];
    const bookings = permissions.includes('bookings.manage')
      ? (
          await this.store
            .collection('bookings')
            .find(
              {},
              {
                projection: {
                  status: 1,
                  payment_status: 1,
                  payment_method: 1,
                  expires_at: 1,
                  requires_attention: 1,
                },
              },
            )
            .toArray()
        ).filter(bookingNeedsAction).length
      : 0;
    const support = permissions.includes('support.manage')
      ? (
          await this.store
            .collection('tickets')
            .find(
              {},
              {
                projection: {
                  status: 1,
                  last_customer_seq: 1,
                  last_support_seq: 1,
                },
              },
            )
            .toArray()
        ).filter(supportNeedsAction).length
      : 0;
    return {
      bookings,
      support,
      total: bookings + support,
      mode: (await this.store.ownership())?.mode || 'mstyle',
    };
  }
  @Get('booking-requests/catalog')
  @Header('Cache-Control', 'no-store')
  @RequireAllPermissions('bookings.manage')
  catalog() {
    return this.bookings.catalog.get();
  }
  @Get('booking-requests/profiles')
  @Header('Cache-Control', 'no-store')
  @RequireAllPermissions('bookings.manage')
  async profiles(@Query('q') query = '') {
    const term = query.trim().slice(0, 100).toLowerCase();
    const profiles = await this.store
      .canonical('profiles')
      .find({ status: 'active' })
      .toArray();
    const items: any[] = [];
    for (const profile of profiles) {
      const members = await this.store
        .canonical('memberships')
        .find({ profileId: profile.profileId, status: 'active' })
        .toArray();
      const effective = members.filter((m) => membershipIsEffective(m));
      const member = effective.find((m) => m.role === 'owner') || effective[0];
      const identity = member
        ? await this.store
            .canonical('identities')
            .findOne({ subject: member.subject, identityStatus: 'active' })
        : null;
      if (!identity) continue;
      const item = {
        profile_id: profile.profileId,
        label: profile.label || profile.profileId,
        owner_subject: identity.subject,
        owner_name: identity.displayName || identity.name || '',
      };
      if (!term || JSON.stringify(item).toLowerCase().includes(term))
        items.push(item);
      if (items.length >= 100) break;
    }
    return { items };
  }
  @Get('booking-requests/availability')
  @Header('Cache-Control', 'no-store')
  @RequireAllPermissions('bookings.manage')
  availability(@Query() q: any) {
    return this.bookings.availability(
      integer(q.room_id, 'room_id', 1),
      String(q.date || ''),
    );
  }
  @Get('booking-requests')
  @Header('Cache-Control', 'no-store')
  async list(@Req() req: any, @Query() q: any) {
    return this.bookings.list(await this.identity.nativeActor(req.user), q);
  }
  @Get('booking-requests/:id')
  @Header('Cache-Control', 'no-store')
  async detail(@Req() req: any, @Param('id') id: string) {
    return this.bookings.detail(
      await this.identity.nativeActor(req.user),
      integer(id, 'id', 1),
    );
  }
  @Post('booking-requests')
  @Header('Cache-Control', 'no-store')
  async create(
    @Req() req: any,
    @Body() body: any,
    @Headers('idempotency-key') key: string,
  ) {
    return this.bookings.create(
      await this.identity.nativeActor(req.user),
      body,
      key,
    );
  }
  @Post('booking-requests/quote')
  @Header('Cache-Control', 'no-store')
  @RequireAllPermissions('bookings.manage')
  async quote(@Req() req: any, @Body() body: any) {
    return this.bookings.quote(await this.identity.nativeActor(req.user), body);
  }
  @Post('booking-requests/blocks')
  @Header('Cache-Control', 'no-store')
  async block(
    @Req() req: any,
    @Body() body: any,
    @Headers('idempotency-key') key: string,
  ) {
    return this.bookings.block(
      await this.identity.nativeActor(req.user),
      body,
      key,
    );
  }
  @Patch('booking-requests/:id')
  @Header('Cache-Control', 'no-store')
  async edit(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
    @Headers('idempotency-key') key: string,
  ) {
    return this.bookings.change(
      await this.identity.nativeActor(req.user),
      integer(id, 'id', 1),
      'edit',
      body,
      key,
    );
  }
  @Post('booking-requests/:id/:action')
  @Header('Cache-Control', 'no-store')
  async action(
    @Req() req: any,
    @Param('id') id: string,
    @Param('action') action: string,
    @Body() body: any,
    @Headers('idempotency-key') key: string,
  ) {
    const actor = await this.identity.nativeActor(req.user);
    const n = integer(id, 'id', 1);
    if (action === 'issue-invoice')
      return this.payments.invoice(actor, n, body, key);
    if (action === 'send-invoice')
      return this.payments.sendInvoice(actor, n, body, key);
    if (action === 'transfer' || action === 'extend')
      return this.bookings.change(actor, n, action, body, key);
    if (action === 'repeat') return this.bookings.repeat(actor, n, body, key);
    return this.bookings.action(actor, n, action, body, key);
  }
  @Get('booking-requests/:id/invoice.pdf')
  @Header('Cache-Control', 'no-store')
  async invoice(
    @Req() req: any,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const file = await this.payments.invoicePdf(
      await this.identity.nativeActor(req.user),
      integer(id, 'id', 1),
    );
    response
      .set({
        'Content-Type': 'application/pdf',
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      })
      .send(file.bytes);
  }
  @Get('resident-hours/:profileId')
  @Header('Cache-Control', 'no-store')
  @RequireAllPermissions('bookings.manage')
  async balance(@Req() req: any, @Param('profileId') id: string) {
    return this.hours.read(await this.identity.nativeActor(req.user), id);
  }
  @Post('resident-hours/:profileId/adjustments')
  @Header('Cache-Control', 'no-store')
  async adjust(
    @Req() req: any,
    @Param('profileId') id: string,
    @Body() body: any,
    @Headers('idempotency-key') key: string,
  ) {
    return this.hours.adjust(
      await this.identity.nativeActor(req.user),
      id,
      body,
      key,
    );
  }
  @Get('service-requests')
  @Header('Cache-Control', 'no-store')
  async tickets(@Req() req: any, @Query() q: any) {
    return this.support.list(await this.identity.nativeActor(req.user), q);
  }
  @Get('service-requests/:id')
  @Header('Cache-Control', 'no-store')
  async ticket(@Req() req: any, @Param('id') id: string) {
    return this.support.detail(
      await this.identity.nativeActor(req.user),
      integer(id, 'id', 1),
    );
  }
  @Post('service-requests/attachments')
  @Header('Cache-Control', 'no-store')
  async upload(
    @Req() req: any,
    @Body() body: any,
    @Headers('idempotency-key') key: string,
  ) {
    return this.support.upload(
      await this.identity.nativeActor(req.user),
      body,
      key,
    );
  }
  @Get('service-requests/attachments/:id')
  @Header('Cache-Control', 'no-store')
  async download(
    @Req() req: any,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const file = await this.support.download(
      await this.identity.nativeActor(req.user),
      integer(id, 'id', 1),
    );
    response
      .set({
        'Content-Type': file.mime,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      })
      .send(file.bytes);
  }
  @Post('service-requests/:id/messages')
  @Header('Cache-Control', 'no-store')
  async reply(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
    @Headers('idempotency-key') key: string,
  ) {
    return this.support.reply(
      await this.identity.nativeActor(req.user),
      integer(id, 'id', 1),
      body,
      key,
    );
  }
  @Patch('service-requests/:id/status')
  @Header('Cache-Control', 'no-store')
  async status(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
    @Headers('idempotency-key') key: string,
  ) {
    return this.support.status(
      await this.identity.nativeActor(req.user),
      integer(id, 'id', 1),
      body,
      key,
    );
  }
}

@Controller('internal/integrations/mstyle/v2')
@UseGuards(
  MstyleEnabledGuard,
  MstyleServiceTokenGuard,
  MstyleRequestGuard,
  MstyleRouteContextGuard,
)
@SetMetadata(REQUIRE_REQUEST_ID, true)
@UseFilters(OperationsExceptionFilter)
export class OperationsPrivateController {
  constructor(
    readonly store: OperationsStore,
    readonly support: OperationsSupport,
    readonly bookings: OperationsBookings,
    readonly payments: OperationsPayments,
    readonly hours: OperationsHours,
  ) {}
  @HttpCode(200)
  @Post('operations/public')
  @Header('Cache-Control', 'no-store')
  publicRead(@Body() body: any) {
    if (body.action === 'payment.status')
      return this.payments.publicStatus(
        integer(body.booking_id, 'booking_id', 1),
        String(body.token || ''),
      );
    if (body.action === 'availability')
      return this.bookings.availability(
        integer(body.room_id, 'room_id', 1),
        String(body.date || ''),
      );
    if (body.action === 'catalog') return this.bookings.catalog.get();
    if (body.action === 'ownership')
      return this.store.ownership().then((s) => ({
        mode: s?.mode || 'mstyle',
        generation: s?.generation || 1,
      }));
    fail('forbidden', 'Операция недоступна.', 403);
  }
  @HttpCode(200)
  @Post('operations/system')
  @Header('Cache-Control', 'no-store')
  system(@Body() body: any, @Req() req: MstyleRequest) {
    if (req.mstyleActorRef !== 'system:operations')
      fail('forbidden', 'Недопустимый контекст операции.', 403);
    if (body.action === 'payment.webhook')
      return this.payments.webhook(body.payload);
    fail('forbidden', 'Операция недоступна.', 403);
  }
  @HttpCode(200)
  @Post('operations/resident')
  @Header('Cache-Control', 'no-store')
  resident(
    @Body() body: any,
    @Req() req: MstyleRequest,
    @Headers('idempotency-key') key: string,
  ) {
    if (!req.mstyleResidentSubject)
      fail('unauthorized', 'Необходима авторизация.', 401);
    return this.dispatch(
      {
        ref: 'resident:' + req.mstyleResidentSubject,
        kind: 'resident',
        subject: req.mstyleResidentSubject,
      },
      body,
      key,
    );
  }
  @HttpCode(200)
  @Post('guest-parties/:guestPartyId/operations')
  @Header('Cache-Control', 'no-store')
  guest(
    @Body() body: any,
    @Req() req: MstyleRequest,
    @Headers('idempotency-key') key: string,
  ) {
    if (!req.mstyleGuestPartyId)
      fail('unauthorized', 'Подтвердите телефон гостя.', 401);
    if (
      ![
        'booking.create',
        'booking.detail',
        'booking.payment',
        'booking.quote',
      ].includes(body.action)
    )
      fail('forbidden', 'Операция недоступна гостю.', 403);
    return this.dispatch(
      {
        ref: 'guest:' + req.mstyleGuestPartyId,
        kind: 'guest',
        guestPartyId: req.mstyleGuestPartyId,
      },
      body,
      key,
    );
  }
  async dispatch(actor: OperationsActor, body: any, key: string) {
    const input = body.input || {};
    const id = body.id == null ? 0 : integer(body.id, 'id', 1);
    switch (body.action) {
      case 'booking.conflicts': {
        if (id) await this.bookings.detail(actor, id);
        const conflicts = await this.bookings.conflicts(
          integer(input.room_id, 'room_id', 1),
          normalizeSegments(input.segments),
          id,
        );
        return { conflict: conflicts.length > 0 };
      }
      case 'booking.list':
        return this.bookings.list(actor, input);
      case 'booking.detail':
        return this.bookings.detail(actor, id);
      case 'booking.payment': {
        const result = await this.bookings.detail(actor, id);
        return {
          booking: result.booking,
          payment: {
            status: result.booking.payment_status,
            confirmation_url: result.booking.payment_url || null,
            pending:
              result.booking.status === 'hold' && !result.booking.payment_url,
          },
        };
      }
      case 'booking.quote':
        return this.bookings.quote(actor, input);
      case 'booking.create':
        return this.payments.finishCreate(
          actor,
          await this.bookings.create(actor, input, key),
        );
      case 'booking.cancel':
        return this.bookings.customerCancel(actor, id, input, key);
      case 'booking.transfer':
        return this.payments.finishChange(
          actor,
          await this.bookings.change(actor, id, 'transfer', input, key),
        );
      case 'booking.extend':
        return this.payments.finishChange(
          actor,
          await this.bookings.change(actor, id, 'extend', input, key),
        );
      case 'booking.repeat':
        return this.payments.finishCreate(
          actor,
          await this.bookings.repeat(actor, id, input, key),
        );
      case 'booking.invoice': {
        const file = await this.payments.invoicePdf(actor, id);
        return { name: file.name, base64: file.bytes.toString('base64') };
      }
      case 'profile.policy': {
        const { profile } = await this.bookings.identities.profile(
          actor,
          String(input.profile_id || ''),
        );
        const policy = await this.store
          .collection('profile_policies')
          .findOne(
            { profile_id: profile.profileId },
            { projection: { _id: 0 } },
          );
        return {
          prepay_required: false,
          preferred_invoice_issuer_id: 0,
          ...policy,
        };
      }
      case 'hours.get':
        return this.hours.read(actor, String(input.profile_id || ''));
      case 'support.list':
        return this.support.list(actor, input);
      case 'support.detail':
        return this.support.detail(actor, id);
      case 'support.create':
        return this.support.create(actor, input, key);
      case 'support.reply':
        return this.support.reply(actor, id, input, key);
      case 'support.read':
        return this.support.read(actor, id, input, key);
      case 'support.upload':
        return this.support.upload(actor, input, key);
      case 'support.download': {
        const file = await this.support.download(actor, id);
        return {
          name: file.name,
          mime: file.mime,
          base64: file.bytes.toString('base64'),
        };
      }
      default:
        fail('not_found', 'Операция не найдена.', 404);
    }
  }
}
