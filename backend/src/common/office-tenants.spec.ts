import { Types } from 'mongoose';
import {
  collectOfficeTenantIds,
  officeAssignedToQuery,
  officeHasTenant,
  normalizeOfficeTenantIds,
  officeTenantWrite,
} from './office-tenants';

describe('office-tenants', () => {
  const a = new Types.ObjectId().toString();
  const b = new Types.ObjectId().toString();

  it('collects tenantId and tenantIds without duplicates', () => {
    expect(
      collectOfficeTenantIds({
        tenantId: a,
        tenantIds: [a, b],
      }),
    ).toEqual([a, b]);
    expect(collectOfficeTenantIds({})).toEqual([]);
  });

  it('checks membership and builds $or query', () => {
    expect(officeHasTenant({ tenantId: a }, a)).toBe(true);
    expect(officeHasTenant({ tenantIds: [b] }, a)).toBe(false);
    const q = officeAssignedToQuery(a);
    expect(q.$or).toHaveLength(2);
  });

  it('writes primary tenantId plus full tenantIds', () => {
    const ids = normalizeOfficeTenantIds([a, b, a, '']);
    expect(ids.map(String)).toEqual([a, b]);
    expect(officeTenantWrite(ids)).toEqual({
      $set: { tenantId: ids[0], tenantIds: ids },
    });
    expect(officeTenantWrite([])).toEqual({
      $set: { tenantIds: [] },
      $unset: { tenantId: 1 },
    });
  });
});
