/** Membership dates are an additional authorization boundary, including legacy rows. */
export const EMPLOYEE_SLOT_STATUSES = ['active', 'invited'] as const;

export function membershipOccupiesEmployeeSlot(membership: {
  role?: string;
  status?: string;
}): boolean {
  return (
    membership.role === 'employee' &&
    EMPLOYEE_SLOT_STATUSES.includes(
      membership.status as (typeof EMPLOYEE_SLOT_STATUSES)[number],
    )
  );
}

export function membershipIsEffective<
  T extends {
    status?: string;
    validFrom?: string | null;
    validUntil?: string | null;
  },
>(
  membership: T | null | undefined,
  now = Date.now(),
): membership is T & { status: 'active' } {
  if (!membership || membership.status !== 'active') return false;
  const from =
    membership.validFrom == null ? -Infinity : Date.parse(membership.validFrom);
  const until =
    membership.validUntil == null
      ? Infinity
      : Date.parse(membership.validUntil);
  return from <= now && now < until;
}
