import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { createHash, randomBytes } from 'node:crypto';
import { OperationsBookings } from '../operations/operations.bookings';
import { OperationsIdentity } from '../operations/operations.identity';
import { OperationsExceptionFilter } from '../operations/operations.controller';
import {
  fail,
  integer,
  requirePermission,
} from '../operations/operations.rules';

const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Controller('kiosk')
@UseFilters(OperationsExceptionFilter)
export class KioskController {
  constructor(
    private readonly bookings: OperationsBookings,
    private readonly identity: OperationsIdentity,
  ) {}

  private devices() {
    return this.bookings.store.collection('kiosk_devices');
  }

  private async adminRooms(user: any) {
    const actor = await this.identity.nativeActor(user);
    requirePermission(actor, 'admin.panel');
    return (await this.bookings.adminCatalog(actor)).rooms.filter(
      (room: any) => room.active !== false && room.type === 'meeting',
    );
  }

  @Get('rooms')
  @UseGuards(AuthGuard('jwt'))
  @Header('Cache-Control', 'no-store')
  async rooms(@Req() req: any) {
    return {
      rooms: (await this.adminRooms(req.user)).map((room: any) => ({
        id: room.id,
        title: room.title,
      })),
    };
  }

  @Post('device')
  @UseGuards(AuthGuard('jwt'))
  @Header('Cache-Control', 'no-store')
  async bind(@Req() req: any, @Body() body: any) {
    const roomId = integer(body.roomId, 'roomId', 1);
    const rooms = await this.adminRooms(req.user);
    const room = rooms.find((r: any) => r.id === roomId);
    if (!room) fail('room_not_found', 'Переговорная недоступна.', 404);
    const previousToken: unknown = body.previousToken;
    const previous =
      typeof previousToken === 'string'
        ? await this.devices().findOne({
            tokenHash: digest(previousToken),
            revoked: false,
          })
        : null;
    if (previous && !rooms.some((r: any) => r.id === previous.roomId))
      fail('forbidden', 'Нет доступа к предыдущей переговорной.', 403);
    const token = randomBytes(32).toString('hex');
    await this.devices().insertOne({
      tokenHash: digest(token),
      roomId,
      createdBy: String(req.user.userId),
      createdAt: new Date(),
      revoked: false,
    });
    if (previous)
      await this.devices().updateOne(
        { _id: previous._id },
        { $set: { revoked: true } },
      );
    return { token };
  }

  @Delete('device')
  @UseGuards(AuthGuard('jwt'))
  async revoke(@Req() req: any, @Body() body: any) {
    const rooms = await this.adminRooms(req.user);
    const token: unknown = body.token;
    const device =
      typeof token === 'string'
        ? await this.devices().findOne({
            tokenHash: digest(token),
            revoked: false,
          })
        : null;
    if (!device) return { ok: true };
    if (!rooms.some((room: any) => room.id === device.roomId))
      fail('forbidden', 'Нет доступа к этой переговорной.', 403);
    await this.devices().updateOne(
      { _id: device._id },
      { $set: { revoked: true } },
    );
    return { ok: true };
  }

  @Get('status')
  @Header('Cache-Control', 'no-store')
  async status(@Headers('authorization') authorization?: string) {
    const token = authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    const device = token
      ? await this.devices().findOne({
          tokenHash: digest(token),
          revoked: false,
        })
      : null;
    if (!device)
      fail(
        'device_unauthorized',
        'Планшет не привязан или доступ отозван.',
        401,
      );
    const now = new Date();
    const date = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
    const data = await this.bookings.availability(
      integer(device.roomId, 'roomId', 1),
      date,
    );
    if (data.room.active === false || data.room.type !== 'meeting')
      fail('room_not_found', 'Переговорная недоступна.', 404);
    // Deliberate allowlist: no requester, comments, prices, or busy_ranges.
    return {
      room: { id: data.room.id, title: data.room.title },
      date,
      serverTime: new Date().toISOString(),
      slots: data.slots.map((slot: any) => ({
        start_minute: slot.start_minute,
        end_minute: slot.end_minute,
        state: slot.state === 'free' ? 'free' : 'busy',
      })),
    };
  }
}
