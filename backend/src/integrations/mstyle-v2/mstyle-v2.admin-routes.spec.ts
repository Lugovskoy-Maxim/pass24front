import { generateKeyPairSync, randomBytes, sign } from 'crypto';
import {
  MstyleRouteContextGuard,
  MstyleServiceTokenGuard,
  type MstyleRequest,
} from './mstyle-v2.http';

const prefix = '/api/internal/integrations/mstyle/v2';
const scope = (value: string) => 'mstyle.' + value;
const routes = [
  [
    'R-04',
    'GET',
    '/resident-profiles/prf_1',
    'integration.admin.profile.read',
    '',
  ],
  [
    'R-06',
    'POST',
    '/resident-profiles/search',
    'integration.admin.profile.read',
    'admin_support_review',
  ],
  [
    'R-08',
    'POST',
    '/resident-onboarding',
    'integration.admin.onboarding.write',
    'resident_onboarding',
  ],
  [
    'R-09',
    'POST',
    '/resident-profiles/prf_1/lifecycle-transitions',
    'integration.admin.profile.write',
    '',
  ],
  [
    'R-10',
    'POST',
    '/resident-profiles/prf_1/deletion-requests',
    'integration.admin.profile.write',
    '',
  ],
  [
    'R-13',
    'GET',
    '/resident-profiles/prf_1/physical-access',
    'integration.admin.physical_access.read',
    '',
  ],
  ['R-14', 'GET', '/identities/usr_1', 'integration.admin.identity.read', ''],
  [
    'R-15',
    'POST',
    '/resident-profile-change-requests/crq_1/decisions',
    'integration.admin.change_request.decide',
    'profile_change_request',
  ],
  [
    'R-17',
    'GET',
    '/deletion-requests/del_1',
    'integration.admin.profile.read',
    '',
  ],
  [
    'M-01',
    'GET',
    '/resident-profiles/prf_1/memberships',
    'integration.admin.members.read',
    '',
  ],
  [
    'C-03',
    'GET',
    '/resident-profiles/prf_1/contact-assignments',
    'integration.admin.profile.read',
    '',
  ],
  [
    'P-05',
    'POST',
    '/resident-profiles/prf_1/contacts/reveal',
    'resident.contact.read',
    'admin_support_review',
  ],
  [
    'P-06',
    'POST',
    '/private-data-snapshots/snp_1/reveal',
    'resident.snapshot.private.reveal',
    'admin_support_review',
  ],
  [
    'G-05',
    'POST',
    '/guest-parties/gst_1/contacts/reveal',
    'guest.contact.read',
    'admin_support_review',
  ],
  [
    'G-07',
    'POST',
    '/guest-parties/gst_1/private-data/reveal',
    'guest.private.reveal',
    'admin_support_review',
  ],
  [
    'G-12',
    'POST',
    '/guest-parties/search',
    'integration.admin.guest.read',
    'admin_support_review',
  ],
];
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
function setup(row = routes[6]) {
  const [, method, path, required, purpose] = row;
  const client = {
    clientId: 'mstyle-backend-test',
    adminAllowed: true,
    algorithm: 'RS256',
    auth: 'private_key_jwt',
    scopes: routes.map((item) => scope(item[3])),
    publicKeysByKid: {
      test: keys.publicKey.export({ type: 'spki', format: 'pem' }),
    },
  };
  const cfg = {
    oauthClient: () => client,
    privateApiBase: () => 'https://pass.mstyle.ru' + prefix,
    reconcileClientId: () => 'reconcile',
    tokenAudience: () => 'api',
  };
  const req = {
    method,
    originalUrl: prefix + path,
    params: {},
    rawHeaders: [],
    headers: {
      authorization: 'Bearer service',
      'x-actor-ref': 'wp-admin:7',
      'x-purpose-code': purpose,
      'x-request-id': 'req_test',
    },
    mstyleRequestId: 'req_test',
    mstyleClientId: client.clientId,
    mstyleTokenScopes: [scope(required)],
    mstyleAcceptedScopes: [scope(required)],
  } as unknown as MstyleRequest;
  const now = Math.floor(Date.now() / 1000);
  const body = [
    { alg: 'RS256', typ: 'mstyle-admin-step-up+jwt', kid: 'test' },
    {
      iss: client.clientId,
      sub: 'wp-admin:7',
      aud: cfg.privateApiBase(),
      iat: now,
      exp: now + 55,
      jti: randomBytes(24).toString('base64url'),
      auth_context: 'wp_session',
      scope: scope(required),
      purpose,
      method,
      target: req.originalUrl,
      requestId: 'req_test',
    },
  ]
    .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .join('.');
  req.headers['x-admin-step-up-assertion'] =
    body +
    '.' +
    sign('sha256', Buffer.from(body), keys.privateKey).toString('base64url');
  const replay = {
    create: jest.fn(async () => undefined),
  };
  const audit = { create: jest.fn(async () => undefined) };
  const guard = new MstyleRouteContextGuard(
    cfg as any,
    {} as any,
    replay as any,
    audit as any,
    {} as any,
    {} as any,
  );
  const tokenRow = {
    clientId: client.clientId,
    scopes: [scope(required)],
    aud: 'api',
    expiresAt: new Date(Date.now() + 10000),
  };
  const tokenGuard = new MstyleServiceTokenGuard(
    cfg as any,
    { findOne: async () => tokenRow } as any,
  );
  const context = { switchToHttp: () => ({ getRequest: () => req }) } as any;
  return { guard, tokenGuard, context, req, replay, audit, tokenRow };
}
describe('all authorized administrative routes', () => {
  it.each(routes)('%s accepts a bound JWT and requires it', async (...row) => {
    const x = setup(row);
    await expect(x.tokenGuard.canActivate(x.context)).resolves.toBe(true);
    await expect(x.guard.canActivate(x.context)).resolves.toBe(true);
    expect(x.replay.create).toHaveBeenCalledTimes(1);
    expect(x.audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'accepted',
        actorRef: 'wp-admin:7',
        jti: expect.any(String),
      }),
    );
    delete x.req.headers['x-admin-step-up-assertion'];
    await expect(x.guard.canActivate(x.context)).rejects.toMatchObject({
      status: 403,
      problemCode: 'ADMIN_ASSERTION_INVALID',
      errors: [expect.objectContaining({ code: 'required' })],
    });
    expect(x.replay.create).toHaveBeenCalledTimes(1);
  });
  it('returns replayed after a unique-key collision', async () => {
    const x = setup();
    x.replay.create.mockRejectedValueOnce({ code: 11000 } as never);
    await expect(x.guard.canActivate(x.context)).rejects.toMatchObject({
      problemCode: 'ADMIN_ASSERTION_INVALID',
      errors: [expect.objectContaining({ code: 'replayed' })],
    });
    expect(x.audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'replayed' }),
    );
  });
  it.each(['replay', 'audit'] as const)(
    'fails closed when %s storage is unavailable',
    async (store) => {
      const x = setup();
      x[store].create.mockRejectedValueOnce(
        new Error('database offline') as never,
      );
      await expect(x.guard.canActivate(x.context)).rejects.toMatchObject({
        status: 503,
        problemCode: 'UPSTREAM_UNAVAILABLE',
        retryable: true,
      });
    },
  );
  it('requires one original scope, even when a legacy token expands to a route scope', async () => {
    const x = setup();
    x.req.mstyleTokenScopes = ['mstyle.residents.read'];
    await expect(x.guard.canActivate(x.context)).rejects.toMatchObject({
      problemCode: 'ADMIN_ASSERTION_INVALID',
    });
    x.req.mstyleTokenScopes = [
      'mstyle.integration.admin.identity.read',
      'mstyle.integration.admin.profile.read',
    ];
    await expect(x.guard.canActivate(x.context)).rejects.toMatchObject({
      problemCode: 'ADMIN_ASSERTION_INVALID',
    });
    expect(x.replay.create).not.toHaveBeenCalled();
  });
  it('does not add an administrator variant to P-07 or M-02', async () => {
    for (const [method, path] of [
      ['POST', '/private-data-snapshots/snp_1/contacts/reveal'],
      ['POST', '/resident-profiles/prf_1/memberships'],
    ]) {
      const x = setup();
      x.req.method = method;
      x.req.originalUrl = prefix + path;
      await expect(x.guard.canActivate(x.context)).rejects.toBeDefined();
      expect(x.replay.create).not.toHaveBeenCalled();
    }
  });
});
