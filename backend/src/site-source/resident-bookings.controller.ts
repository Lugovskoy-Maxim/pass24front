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
import { fail, integer, OperationsActor } from '../operations/operations.rules';
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
    const person = await this.identity.store
      .canonical('identities')
      .findOne({ userId: user.userId, identityStatus: 'active' });
    if (!person) fail('forbidden', 'Профиль недоступен.', 403);
    const actor: OperationsActor = {
      kind: 'resident',
      ref: 'resident:' + person.subject,
      subject: person.subject,
      name: person.displayName,
    };
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
  async rooms(@Req() req: any, @Query('officeId') officeId?: string) {
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
      rooms: catalog.rooms,
      officeId: String(office._id),
      profileId: profile.profileId,
      availableMinutes: available,
      monthlyMinutes: quota,
      canSpendHours,
      mode: (await this.identity.store.ownership())?.mode || 'mstyle',
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
  private async input(user: any, body: any) {
    const { actor, profile } = await this.context(user, body.officeId);
    const input = {
      room_id: integer(body.roomId, 'roomId', 1),
      office_id: body.officeId,
      profile_id: profile.profileId,
      payment_method: ['cash', 'invoice', 'balance'].includes(
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
    if (input.writeoff_min || input.payment_method === 'balance')
      await this.identity.assertCanSpendHours(actor, profile.profileId);
    return { actor, input };
  }
  @Post('quote')
  async quote(@Req() req: any, @Body() body: any) {
    const { actor, input } = await this.input(req.user, body);
    return this.bookings.quote(actor, input);
  }
  @Post()
  async create(
    @Req() req: any,
    @Body() body: any,
    @Headers('idempotency-key') key: string,
  ) {
    const { actor, input } = await this.input(req.user, body);
    return this.payments.finishCreate(
      actor,
      await this.bookings.create(actor, input, key || randomUUID()),
    );
  }
}
