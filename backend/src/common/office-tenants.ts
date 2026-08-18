import { Types } from 'mongoose';

export type OfficeTenantSource = {
  tenantId?: unknown;
  tenantIds?: unknown[] | null;
};

export function collectOfficeTenantIds(office: OfficeTenantSource): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const push = (value: unknown) => {
    if (value == null || value === '') return;
    const id = String(value);
    if (!Types.ObjectId.isValid(id) || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  push(office.tenantId);
  for (const value of office.tenantIds || []) push(value);
  return ids;
}

export function officeHasTenant(
  office: OfficeTenantSource,
  tenantId?: string | Types.ObjectId | null,
): boolean {
  if (!tenantId) return false;
  return collectOfficeTenantIds(office).includes(String(tenantId));
}

export function officeAssignedToQuery(tenantId: string | Types.ObjectId) {
  const oid =
    tenantId instanceof Types.ObjectId
      ? tenantId
      : new Types.ObjectId(tenantId);
  return { $or: [{ tenantId: oid }, { tenantIds: oid }] };
}

export function officeAssignedToAnyQuery(
  tenantIds: Array<string | Types.ObjectId>,
) {
  const oids = tenantIds
    .filter((id) => id && Types.ObjectId.isValid(String(id)))
    .map((id) =>
      id instanceof Types.ObjectId ? id : new Types.ObjectId(String(id)),
    );
  if (!oids.length) return { _id: { $in: [] } };
  return { $or: [{ tenantId: { $in: oids } }, { tenantIds: { $in: oids } }] };
}

export function normalizeOfficeTenantIds(
  ids: Array<string | Types.ObjectId | null | undefined>,
): Types.ObjectId[] {
  const seen = new Set<string>();
  const oids: Types.ObjectId[] = [];
  for (const id of ids) {
    if (id == null || id === '') continue;
    const key = String(id);
    if (!Types.ObjectId.isValid(key) || seen.has(key)) continue;
    seen.add(key);
    oids.push(new Types.ObjectId(key));
  }
  return oids;
}

export function officeTenantWrite(ids: Types.ObjectId[]): {
  $set: Record<string, unknown>;
  $unset?: { tenantId: 1 };
} {
  if (!ids.length) {
    return {
      $set: { tenantIds: [] },
      $unset: { tenantId: 1 },
    };
  }
  return {
    $set: {
      tenantId: ids[0],
      tenantIds: ids,
    },
  };
}
