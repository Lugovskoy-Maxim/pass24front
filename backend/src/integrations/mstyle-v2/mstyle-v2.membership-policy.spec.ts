import {
  EMPLOYEE_SLOT_STATUSES,
  membershipOccupiesEmployeeSlot,
} from './mstyle-v2.membership-policy';

describe('Mstyle employee slot policy', () => {
  it.each(EMPLOYEE_SLOT_STATUSES)(
    'reserves a slot for an %s employee',
    (status) => {
      expect(membershipOccupiesEmployeeSlot({ role: 'employee', status })).toBe(
        true,
      );
    },
  );

  it.each(['revoked', 'suspended', 'expired'])(
    'releases a slot for a %s employee',
    (status) => {
      expect(membershipOccupiesEmployeeSlot({ role: 'employee', status })).toBe(
        false,
      );
    },
  );

  it('does not count an owner as an employee slot', () => {
    expect(
      membershipOccupiesEmployeeSlot({ role: 'owner', status: 'active' }),
    ).toBe(false);
  });
});
