export type BookingAction =
  'confirm' | 'mark-paid' | 'cancel' | 'edit' | 'resolve-attention';

/** Business actions available for a booking status. Kept pure for unit/API tests. */
export function canBookingAction(
  status: string,
  action: BookingAction,
  requiresAttention = false,
): boolean {
  if (action === 'cancel') return status !== 'cancelled';
  if (action === 'resolve-attention')
    return requiresAttention && status !== 'awaiting_resolution';
  if (status === 'cancelled' || status === 'blocked') return false;
  if (action === 'confirm' && status === 'awaiting_resolution') return false;
  return ['confirm', 'mark-paid', 'edit'].includes(action);
}

export function bookingStatusTone(
  status: string,
): 'success' | 'warning' | 'danger' | 'muted' {
  if (status === 'confirmed') return 'success';
  if (status === 'awaiting_resolution') return 'danger';
  if (status === 'cancelled' || status === 'blocked') return 'muted';
  return 'warning';
}
