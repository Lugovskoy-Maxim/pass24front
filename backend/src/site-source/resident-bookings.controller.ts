import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { randomUUID } from 'node:crypto';
import { OperationsIdentity } from '../operations/operations.identity';
import { OperationsBookings } from '../operations/operations.bookings';
import { OperationsPayments } from '../operations/operations.payments';
import { OperationsExceptionFilter } from '../operations/operations.controller';
import { fail, integer } from '../operations/operations.rules';
import { OfficeServicesService } from '../office-services/office-services.service';

@Controller('office-services/bookings')
@UseGuards(AuthGuard('jwt'))
@UseFilters(OperationsExceptionFilter)
export class ResidentBookingsController {
  constructor(
    private readonly identity: OperationsIdentity,
    private readonly bookings: OperationsBookings,
    private readonly payments: OperationsPayments,
    private readonly offices: OfficeServicesService,
  ) {}
  private async context(user: any, officeId?: string) {
    if (
      !user.permissions?.some((p: string) =>
        ['passes.view_own', 'requests.create'].includes(p),
      )
    )
      fail('forbidden', 'Бронирование недоступно.', 403);
    const actor = await this.identity.residentActor(user);
    const ids = await this.identity.profileIds(actor);
    for (const id of ids) {
      const { profile, resource } = await this.identity.profile(actor, id);
      const effective = {
        ...profile,
        officeIds: [
          ...new Set([
            ...(profile.officeIds || []),
            ...(resource.officeIds || []),
          ]),
        ],
      };
      try {
        const office = await this.offices.officeForProfile(effective, officeId);
        if (office) return { actor, profile, resource, effective, office };
      } catch (e) {
        if (ids.length === 1) throw e;
      }
    }
    fail('forbidden', 'Выберите назначенный вам офис.', 403);
  }
  @Get('context')
  async rooms(
    @Req() req: any,
    @Query('officeId') officeId?: string,
    @Query('kiosk') kiosk?: string,
  ) {
    const { actor, profile, resource, effective, office } = await this.context(
      req.user,
      officeId,
    );
    const catalog = await this.offices.bookingCatalog(
      await this.bookings.catalog.get(),
      effective,
      String(office._id),
    );
    const { account } = await this.bookings.hours.read(
      actor,
      profile.profileId,
    );
    const quota =
      (await this.offices.monthlyHours(resource)) ??
      resource.memberPolicy?.residentHoursMonthlyQuotaMin ??
      0;
    const available = account ? this.bookings.hours.available(account) : quota;
    let canSpendHours = true;
    try {
      await this.identity.assertCanSpendHours(actor, profile.profileId);
    } catch {
      canSpendHours = false;
    }
    return {
      rooms:
        req.user.kioskRoomId === undefined
          ? catalog.rooms
          : catalog.rooms.filter(
              (room: any) => room.id === req.user.kioskRoomId,
            ),
      officeId: String(office._id),
      profileId: profile.profileId,
      availableMinutes: available,
      monthlyMinutes: quota,
      canSpendHours,
      mode: (await this.identity.store.ownership())?.mode || 'mstyle',
      ...(kiosk === '1' && {
        onlinePayment: await this.payments.kioskSetupStatus(),
        bookingProfileReady: await this.identity.hasVerifiedBookingContact(
          profile.profileId,
        ),
      }),
    };
  }
  @Get('rooms/:id/slots')
  async slots(
    @Req() req: any,
    @Param('id') id: string,
    @Query('date') date: string,
    @Query('officeId') officeId: string,
  ) {
    const context = await this.rooms(req, officeId);
    const roomId = integer(id, 'room_id', 1);
    if (!context.rooms.some((r: any) => r.id === roomId))
      fail('room_not_found', 'Переговорная недоступна.', 404);
    return this.bookings.availability(roomId, date);
  }
  private async input(user: any, body: any, kiosk = false) {
    const roomId = integer(body.roomId, 'roomId', 1);
    if (user.kioskRoomId !== undefined && roomId !== user.kioskRoomId)
      fail('forbidden', 'Сессия действует только для этой переговорной.', 403);
    const { actor, profile } = await this.context(user, body.officeId);
    const input = {
      room_id: roomId,
      office_id: body.officeId,
      profile_id: profile.profileId,
      payment_method: ['cash', 'invoice', 'balance', 'card_online'].includes(
        body.paymentMethod,
      )
        ? body.paymentMethod
        : 'cash',
      writeoff_min: integer(body.writeoffMinutes || 0, 'writeoffMinutes'),
      segments: [
        {
          date: body.date,
          start_minute: integer(body.startMinute, 'startMinute', 0, 1439),
          end_minute: integer(body.endMinute, 'endMinute', 1, 1440),
        },
      ],
      comment_client: body.comment || '',
      pricing_fingerprint: body.pricingFingerprint,
    };
    const [segment] = input.segments;
    if (kiosk && segment.end_minute - segment.start_minute < 60)
      fail('validation_error', 'Минимальная длительность брони — 1 час.', 422);
    if (input.writeoff_min || input.payment_method === 'balance')
      await this.identity.assertCanSpendHours(actor, profile.profileId);
    return { actor, input };
  }
  @Post('quote')
  async quote(
    @Req() req: any,
    @Body() body: any,
    @Query('kiosk') kiosk?: string,
  ) {
    const { actor, input } = await this.input(
      req.user,
      body,
      kiosk === '1' || req.user.kioskRoomId !== undefined,
    );
    const quote = await this.bookings.quote(actor, input);
    if (input.payment_method === 'card_online' && quote.total_amount_minor > 0)
      await this.payments.validateKioskPayment();
    return quote;
  }
  @Post()
  async create(
    @Req() req: any,
    @Body() body: any,
    @Headers('idempotency-key') key: string,
  ) {
    return this.createBooking(req.user, body, key, false);
  }
  @Post('kiosk')
  async createKiosk(
    @Req() req: any,
    @Body() body: any,
    @Headers('idempotency-key') key: string,
  ) {
    return this.createBooking(req.user, body, key, true);
  }
  private async createBooking(
    user: any,
    body: any,
    key: string,
    deferGateway: boolean,
  ) {
    const { actor, input } = await this.input(user, body, deferGateway);
    return this.payments.finishCreate(
      actor,
      await this.bookings.create(
        actor,
        input,
        key || randomUUID(),
        deferGateway
          ? (contact) => this.payments.validateKioskPayment(contact)
          : undefined,
      ),
      deferGateway,
    );
  }
}
