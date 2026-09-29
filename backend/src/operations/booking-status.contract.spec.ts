import {
  bookingStatusTone,
  canBookingAction,
} from '../../../frontend/src/lib/booking-status';

describe('booking status UI contract', () => {
  it('does not offer confirmation while a paid conflict is unresolved', () => {
    expect(canBookingAction('awaiting_resolution', 'confirm')).toBe(false);
    expect(canBookingAction('awaiting_resolution', 'edit')).toBe(true);
    expect(canBookingAction('awaiting_resolution', 'cancel')).toBe(true);
    expect(
      canBookingAction('awaiting_resolution', 'resolve-attention', true),
    ).toBe(false);
  });

  it('allows finance to resolve attention after cancellation', () => {
    expect(canBookingAction('cancelled', 'resolve-attention', true)).toBe(true);
    expect(canBookingAction('cancelled', 'resolve-attention', false)).toBe(
      false,
    );
  });

  it('blocks actions unavailable in terminal states and maps status tones', () => {
    for (const status of ['cancelled', 'blocked']) {
      expect(canBookingAction(status, 'confirm')).toBe(false);
      expect(canBookingAction(status, 'edit')).toBe(false);
      expect(canBookingAction(status, 'mark-paid')).toBe(false);
    }
    expect(bookingStatusTone('confirmed')).toBe('success');
    expect(bookingStatusTone('awaiting_resolution')).toBe('danger');
    expect(bookingStatusTone('cancelled')).toBe('muted');
    expect(bookingStatusTone('awaiting_payment')).toBe('warning');
  });
});
