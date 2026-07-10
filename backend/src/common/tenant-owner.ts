import { Types } from 'mongoose';

export function resolveTenantOwnerId(user?: { userId?: string; parentTenantId?: string }): string | undefined {
  if (!user?.userId) return undefined;
  return user.parentTenantId || user.userId;
}

export function tenantOwnerObjectId(user?: { userId?: string; parentTenantId?: string }): Types.ObjectId | undefined {
  const id = resolveTenantOwnerId(user);
  return id ? new Types.ObjectId(id) : undefined;
}