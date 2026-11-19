import { createHash } from 'node:crypto';
import { KioskController } from './kiosk.controller';
import { OperationsPayments } from '../operations/operations.payments';
import { AuthService } from '../auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import type { OperationsBookings } from '../operations/operations.bookings';
import type { OperationsIdentity } from '../operations/operations.identity';

describe('meeting room kiosk access', () => {
  const token = 'a'.repeat(64);
  let controller: KioskController;
  let devices: any;
  let bookings: any;
  let identity: any;
  beforeEach(() => {
    devices = {
      findOne: jest.fn(),
      insertOne: jest.fn(),
      updateOne: jest.fn(),
    };
    bookings = {
      store: { collection: jest.fn(() => devices) },
      adminCatalog: jest.fn().mockResolvedValue({
        rooms: [
          { id: 301, title: 'Переговорная 301', type: 'meeting' },
          { id: 302, title: 'Архивная', type: 'meeting', active: false },
          { id: 303, title: 'Офис', type: 'office' },
        ],
      }),
      availability: jest.fn().mockResolvedValue({
        room: {
          id: 301,
          title: 'Переговорная 301',
          type: 'meeting',
          config: { price_amount_minor: 1234 },
        },
        slots: [
          {
            start_minute: 600,
            end_minute: 630,
            state: 'free',
            hold_until: 'secret',
          },
          { start_minute: 630, end_minute: 660, state: 'reserved' },
        ],
        busy_ranges: [{ requester: 'private', comment_client: 'secret' }],
      }),
    };
    identity = {
      nativeActor: jest.fn().mockResolvedValue({
        kind: 'admin',
        permissions: ['admin.panel', 'bookings.manage'],
      }),
    };
    controller = new KioskController(
      bookings as OperationsBookings,
      identity as OperationsIdentity,
      { kioskStatus: jest.fn() } as unknown as OperationsPayments,
      {} as AuthService,
      {} as JwtService,
    );
  });

  it('rejects missing, malformed and revoked device credentials without reading bookings', async () => {
    for (const header of [undefined, 'Bearer user-jwt', `Bearer ${token}`]) {
      await expect(controller.status(header)).rejects.toMatchObject({
        status: 401,
      });
    }
    expect(bookings.availability).not.toHaveBeenCalled();
    expect(devices.findOne).toHaveBeenCalledWith({
      tokenHash: createHash('sha256').update(token).digest('hex'),
      revoked: false,
    });
  });

  it('reads only the bound room and exposes only time intervals and anonymous occupancy', async () => {
    devices.findOne.mockResolvedValue({ roomId: 301 });
    const result = await controller.status(`Bearer ${token}`);
    expect(bookings.availability).toHaveBeenCalledWith(
      301,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(result.room).toEqual({ id: 301, title: 'Переговорная 301' });
    expect(result.slots).toEqual([
      { start_minute: 600, end_minute: 630, state: 'free' },
      { start_minute: 630, end_minute: 660, state: 'busy' },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /private|secret|price|busy_ranges/,
    );
  });

  it('requires administrator access and rejects rooms outside the scoped catalog', async () => {
    identity.nativeActor.mockResolvedValueOnce({
      kind: 'admin',
      permissions: [],
    });
    await expect(
      controller.bind({ user: {} }, { roomId: 301 }),
    ).rejects.toMatchObject({ status: 403 });
    for (const roomId of [999, 302, 303]) {
      await expect(
        controller.bind({ user: {} }, { roomId }),
      ).rejects.toMatchObject({ status: 404 });
    }
    expect(devices.insertOne).not.toHaveBeenCalled();
  });

  it('stores only a hash of a random device token, and does not revoke before successful creation', async () => {
    devices.findOne.mockResolvedValue({ _id: 'old', roomId: 301 });
    const result = await controller.bind(
      { user: { userId: 'admin' } },
      { roomId: 301, previousToken: token },
    );
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    const stored = devices.insertOne.mock.calls[0][0];
    expect(stored.token).toBeUndefined();
    expect(stored.tokenHash).toBe(
      createHash('sha256').update(result.token).digest('hex'),
    );
    expect(devices.insertOne.mock.invocationCallOrder[0]).toBeLessThan(
      Number(devices.updateOne.mock.invocationCallOrder[0]),
    );
  });

  it('does not revoke a device belonging to another administrator scope', async () => {
    devices.findOne.mockResolvedValue({ _id: 'other', roomId: 999 });
    await expect(
      controller.revoke({ user: {} }, { token }),
    ).rejects.toMatchObject({ status: 403 });
    expect(devices.updateOne).not.toHaveBeenCalled();
  });

  it('stops exposing inactive rooms even when a device token remains valid', async () => {
    devices.findOne.mockResolvedValue({ roomId: 301 });
    bookings.availability.mockResolvedValue({
      room: { id: 301, active: false, type: 'meeting' },
    });
    await expect(controller.status(`Bearer ${token}`)).rejects.toMatchObject({
      status: 404,
    });
  });
});
