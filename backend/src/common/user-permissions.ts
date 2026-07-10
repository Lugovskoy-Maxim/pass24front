export function userHasPermission(user: { permissions?: string[] }, permission: string): boolean {
  return !!user.permissions?.includes(permission);
}

export function userHasAnyPermission(user: { permissions?: string[] }, ...permissions: string[]): boolean {
  if (!user.permissions?.length) return false;
  return permissions.some((p) => user.permissions!.includes(p));
}