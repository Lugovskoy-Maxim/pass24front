import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { AuthService } from '../auth/auth.service';
import { OperationsBookings } from '../operations/operations.bookings';
import { OperationsIdentity } from '../operations/operations.identity';
import { OperationsPayments } from '../operations/operations.payments';
import { OperationsExceptionFilter } from '../operations/operations.controller';
import {
  fail,
  integer,
  requirePermission,
} from '../operations/operations.rules';

const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const nonce = () => randomBytes(32).toString('hex');
const validCode = (code: unknown): code is string =>
  typeof code === 'string' && /^[a-f0-9]{64}$/.test(code);
const displayCode = (hash: string) =>
  String(parseInt(hash.slice(0, 8), 16) % 10000).padStart(4, '0');

@Controller('kiosk')
@UseFilters(OperationsExceptionFilter)
export class KioskController {
  constructor(
    private readonly bookings: OperationsBookings,
    private readonly identity: OperationsIdentity,
    private readonly payments: OperationsPayments,
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
  ) {}

  private logins() {
    return this.bookings.store.collection('kiosk_logins');
  }

  @Post('login/sms/request')
  @Header('Cache-Control', 'no-store')
  async requestSms(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { phone?: unknown },
  ) {
    const device = await this.device(authorization);
    const now = new Date();
    const allowed = await this.devices().updateOne(
      {
        _id: device._id,
        revoked: false,
        $or: [
          { smsRequestedAt: { $exists: false } },
          { smsRequestedAt: { $lte: new Date(+now - 10_000) } },
        ],
      },
      { $set: { smsRequestedAt: now } },
    );
    if (!allowed.modifiedCount)
      fail('rate_limited', 'Повторите запрос через 10 секунд.', 429);
    return this.auth.requestKioskSms(body?.phone, authorization!);
  }

  @Post('login/sms/confirm')
  @Header('Cache-Control', 'no-store')
  async confirmSms(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { phone?: unknown; code?: unknown },
  ) {
    const device = await this.device(authorization);
    const { user } = await this.auth.confirmKioskSms(
      body?.phone,
      body?.code,
      authorization!,
    );
    const token = this.jwt.sign(
      { sub: user.id, email: user.email, kioskRoomId: device.roomId },
      { expiresIn: '15m' },
    );
    return { user, token };
  }

  @Post('login/start')
  @Header('Cache-Control', 'no-store')
  async startLogin(@Headers('authorization') authorization?: string) {
    const device = await this.device(authorization);
    const approvalCode = nonce();
    const claimCode = nonce();
    const approvalHash = digest(approvalCode);
    const expiresAt = new Date(Date.now() + 60_000);
    await this.logins().replaceOne(
      { _id: device._id },
      { approvalHash, claimHash: digest(claimCode), expiresAt },
      { upsert: true },
    );
    return { approvalCode, claimCode, displayCode: displayCode(approvalHash) };
  }

  private approvalQuery(code: unknown) {
    if (!validCode(code))
      fail('kiosk_login_expired', 'QR-код недействителен или истёк.', 404);
    return {
      approvalHash: digest(code),
      expiresAt: { $gt: new Date() },
      userId: { $exists: false },
    };
  }

  @Post('login/preview')
  @UseGuards(AuthGuard('jwt'))
  @Header('Cache-Control', 'no-store')
  async previewLogin(@Body() body: { code: string }) {
    const query = this.approvalQuery(body?.code);
    const login = await this.logins().findOne(query);
    const device =
      login &&
      (await this.devices().findOne({ _id: login._id, revoked: false }));
    const room =
      device &&
      (await this.bookings.catalog.get()).rooms.find(
        (item: any) =>
          item.id === device.roomId &&
          item.type === 'meeting' &&
          item.active !== false,
      );
    if (!room)
      fail('kiosk_login_expired', 'QR-код недействителен или истёк.', 404);
    return {
      roomTitle: room.title,
      displayCode: displayCode(query.approvalHash),
    };
  }

  @Post('login/approve')
  @UseGuards(AuthGuard('jwt'))
  @Header('Cache-Control', 'no-store')
  async approveLogin(@Req() req: any, @Body() body: { code: string }) {
    if (
      !req.user.permissions?.some((p: string) =>
        ['passes.view_own', 'requests.create'].includes(p),
      )
    )
      fail('forbidden', 'Бронирование недоступно.', 403);
    const result = await this.logins().updateOne(
      this.approvalQuery(body?.code),
      { $set: { userId: req.user.userId } },
    );
    if (!result.matchedCount)
      fail('kiosk_login_expired', 'QR-код недействителен или истёк.', 404);
    return { ok: true };
  }

  @Post('login/claim')
  @Header('Cache-Control', 'no-store')
  async claimLogin(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { code: string },
  ) {
    const device = await this.device(authorization);
    if (!validCode(body?.code))
      fail(
        'kiosk_login_expired',
        'Запрос входа недействителен или истёк.',
        404,
      );
    const query = {
      _id: device._id,
      claimHash: digest(body.code),
      expiresAt: { $gt: new Date() },
    };
    const login = await this.logins().findOneAndDelete({
      ...query,
      userId: { $type: 'string' },
    });
    if (!login) {
      if (await this.logins().findOne(query)) return { state: 'pending' };
      fail(
        'kiosk_login_expired',
        'Запрос входа недействителен или истёк.',
        404,
      );
    }
    const { user } = await this.auth.me(login.userId);
    const token = await this.jwt.signAsync(
      { sub: login.userId, email: user.email, kioskRoomId: device.roomId },
      { expiresIn: '5m' },
    );
    return { state: 'approved', session: { user, token } };
  }

  @Post('payment-status')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  paymentStatus(@Body() body: { bookingId: number; token: string }) {
    return this.payments.kioskStatus(
      integer(body?.bookingId, 'bookingId', 1),
      typeof body?.token === 'string' ? body.token : '',
    );
  }

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
    const rooms = await this.adminRooms(req.user);
    return {
      rooms: rooms.map((room: any) => ({
        id: room.id,
        title: room.title,
      })),
      onlinePayment: await this.payments.kioskSetupStatus(),
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

  private async device(authorization?: string) {
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
    return device;
  }

  @Get('status')
  @Header('Cache-Control', 'no-store')
  async status(@Headers('authorization') authorization?: string) {
    const device = await this.device(authorization);
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
