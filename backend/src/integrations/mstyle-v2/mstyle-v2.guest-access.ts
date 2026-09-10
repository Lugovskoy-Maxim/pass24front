/** The guest bearer is bound to one party and cannot authorize service/admin operations. */
export function guestFlowRoute(
  method: string,
  path: string,
): string | undefined {
  const match = path.match(/\/guest-parties\/([^/]+)\/(.+)$/);
  if (!match) return undefined;
  const route = match[2];
  const allowed =
    (method === 'GET' &&
      /^(status|private-data\/status|consents)$/.test(route)) ||
    (method === 'PATCH' && route === 'private-data') ||
    (method === 'POST' &&
      /^(contact-challenges(?:\/[^/]+\/verify)?|snapshots|consents\/[^/]+\/(?:accept|withdraw))$/.test(
        route,
      ));
  return allowed ? match[1] : undefined;
}

export function guestWriteAllowed(status: string): boolean {
  return ['draft', 'contact_verified', 'verified', 'ready'].includes(status);
}
