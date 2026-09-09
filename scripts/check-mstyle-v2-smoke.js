#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

const baseUrl = trimRight(
  process.env.MSTYLE_API_BASE_URL || 'https://pass.mstyle.ru/api',
  '/',
);
const tokenUrl = process.env.MSTYLE_TOKEN_URL || `${baseUrl}/oauth2/token`;
const keyDir =
  process.env.MSTYLE_KEYS_DIR || '/Users/tomilo/Downloads/production-4';
const backendClient = {
  clientId: process.env.MSTYLE_CLIENT_ID || 'mstyle-backend-prod',
  kid: process.env.MSTYLE_CLIENT_KID || 'mstyle-backend-prod-20260823-01',
};
backendClient.privateKeyPath =
  process.env.MSTYLE_CLIENT_PRIVATE_KEY_FILE ||
  `${keyDir}/${backendClient.kid}-private.pem`;
backendClient.publicKeyPath =
  process.env.MSTYLE_CLIENT_PUBLIC_KEY_FILE ||
  `${keyDir}/${backendClient.kid}-public.pem`;
const reconcileClient = {
  clientId: process.env.MSTYLE_RECONCILE_CLIENT_ID || 'mstyle-reconcile-prod',
  kid:
    process.env.MSTYLE_RECONCILE_CLIENT_KID ||
    'mstyle-reconcile-prod-20260823-01',
};
reconcileClient.privateKeyPath =
  process.env.MSTYLE_RECONCILE_CLIENT_PRIVATE_KEY_FILE ||
  `${keyDir}/${reconcileClient.kid}-private.pem`;
reconcileClient.publicKeyPath =
  process.env.MSTYLE_RECONCILE_CLIENT_PUBLIC_KEY_FILE ||
  `${keyDir}/${reconcileClient.kid}-public.pem`;
const schemaVersion = '2.0';
const apiPrefix = '/internal/integrations/mstyle/v2';
const stamp = Date.now().toString(36);
const emailChallengeAddress = process.env.MSTYLE_V2_EMAIL || '';
const adminAssertionSecret =
  process.env.MSTYLE_ADMIN_ASSERTION_SECRET ||
  process.env.MSTYLE_IDEMPOTENCY_SECRET ||
  '';
const TZ_EVENT_TYPES = new Set([
  'identity.updated',
  'identity.auth_version_changed',
  'profile.updated',
  'resident_membership.updated',
  'resident_contact_assignments.updated',
  'resident_private_data.updated',
  'resident_change_request.updated',
  'resident_deletion_request.updated',
  'resident_consent.updated',
  'resident_snapshot.created',
  'guest_party.updated',
  'guest_contact.updated',
  'guest_private_data.updated',
  'guest_consent.updated',
  'guest_snapshot.created',
  'snapshot.operation_bound',
  'physical_access.updated',
]);
const M1_M2_SCOPES = [
  'mstyle.guest.claim',
  'mstyle.guest.contact.read',
  'mstyle.guest.private.reveal',
  'mstyle.guest.snapshot.contact.reveal',
  'mstyle.guest.snapshot.private.reveal',
  'mstyle.integration.admin.change_request.decide',
  'mstyle.integration.admin.guest.read',
  'mstyle.integration.admin.identity.read',
  'mstyle.integration.admin.onboarding.write',
  'mstyle.integration.admin.physical_access.read',
  'mstyle.integration.admin.profile.write',
  'mstyle.resident.change_request.read',
  'mstyle.resident.change_request.write',
  'mstyle.resident.physical_access.read',
  'mstyle.resident.snapshot.contact.reveal',
  'mstyle.resident.snapshot.private.reveal',
];

const state = {
  tokens: new Map(),
  profileId: '',
  subject: '',
  profileEtag: '',
  membershipsEtag: '',
  guestPartyId: '',
  guestEtag: '',
};

const steps = [
  {
    id: 'T-01',
    title: 'OAuth token, integration.reconcile',
    scope: 'mstyle.integration.reconcile',
    client: reconcileClient,
    request: () => tokenFor('mstyle.integration.reconcile', reconcileClient),
  },
  {
    id: 'R-03',
    title: 'Change feed',
    scope: 'mstyle.integration.reconcile',
    client: reconcileClient,
    method: 'GET',
    path: '/changes?limit=5',
    actor: 'reconcile',
    after: ({ body }) => {
      const items = body.items || [];
      for (const item of items) {
        const revision = item.aggregate && item.aggregate.revision;
        if (!Number.isInteger(revision) || revision < 1) {
          throw new Error(
            `R-03 item seq ${item.sequence} missing aggregate.revision`,
          );
        }
        if (!TZ_EVENT_TYPES.has(item.type)) {
          throw new Error(
            `R-03 item seq ${item.sequence} has non-contract type ${item.type}`,
          );
        }
      }
    },
  },
  {
    id: 'R-06',
    title: 'Search profiles',
    scope: 'mstyle.integration.admin.profile.read',
    method: 'POST',
    path: '/resident-profiles/search',
    actor: 'admin-review',
    body: () => ({
      schemaVersion,
      query: { type: 'text', value: `smoke-${stamp}` },
      sort: { field: 'updatedAt', direction: 'desc' },
      limit: 5,
    }),
  },
  {
    id: 'R-08',
    title: 'Onboard profile',
    scope: 'mstyle.integration.admin.onboarding.write',
    method: 'POST',
    path: '/resident-onboarding',
    actor: 'admin-onboarding',
    body: () => ({
      schemaVersion,
      owner: {
        invitation: {
          email: `smoke-owner-${stamp}@pass24.test`,
          displayName: `Smoke Owner ${stamp}`,
        },
      },
      profile: {
        type: 'company',
        legalForm: 'ooo',
        label: `smoke-${stamp}`,
        companyShortName: `smoke-${stamp}`,
        memberPolicy: { employeeLimit: 5 },
      },
      privateData: {
        profileType: 'company',
        legalForm: 'ooo',
        data: {
          fullName: `Smoke ${stamp}`,
          inn: '7700000000',
          ogrn: '1027700000000',
        },
      },
      initialContactAssignments: [
        {
          purpose: 'primary',
          source: {
            kind: 'owner_invitation_contact',
            contactType: 'email',
          },
          priority: 1,
        },
      ],
      sourceLink: {
        sourceSystem: 'mstyle-wordpress',
        environment: 'production',
        entityType: 'resident',
        externalId: `smoke:${stamp}`,
      },
    }),
    after: ({ body, headers }) => {
      state.profileId = pick(body, 'profileId');
      state.subject = pick(body, 'subject');
      state.profileEtag = headers.etag || '';
    },
  },
  {
    id: 'R-14',
    title: 'Admin identity card',
    scope: 'mstyle.integration.admin.identity.read',
    method: 'GET',
    path: () => `/identities/${state.subject}`,
    actor: 'admin-review',
  },
  {
    id: 'R-13',
    title: 'Physical access',
    scope: 'mstyle.integration.admin.physical_access.read',
    method: 'GET',
    path: () => `/resident-profiles/${state.profileId}/physical-access`,
    actor: 'admin-review',
  },
  {
    id: 'R-04',
    title: 'Get profile',
    scope: 'mstyle.resident.profile.read',
    method: 'GET',
    path: () => `/resident-profiles/${state.profileId}`,
    after: ({ headers }) => {
      state.profileEtag = headers.etag || state.profileEtag;
    },
  },
  {
    id: 'R-05',
    title: 'Patch profile with If-Match',
    scope: 'mstyle.resident.profile.write',
    method: 'PATCH',
    path: () => `/resident-profiles/${state.profileId}`,
    headers: () => ({ 'If-Match': state.profileEtag }),
    body: () => ({
      schemaVersion,
      label: `smoke-${stamp}-updated`,
      memberPolicy: { employeeLimit: 2 },
    }),
    after: ({ headers }) => {
      state.profileEtag = headers.etag || state.profileEtag;
    },
  },
  {
    id: 'M-01',
    title: 'List memberships',
    scope: 'mstyle.resident.members.read',
    method: 'GET',
    path: () => `/resident-profiles/${state.profileId}/memberships`,
    after: ({ headers }) => {
      state.membershipsEtag = headers.etag || '';
    },
  },
  {
    id: 'G-01',
    title: 'Create guest party',
    scope: 'mstyle.guest.create',
    method: 'POST',
    path: '/guest-parties',
    body: () => ({
      schemaVersion,
      purpose: 'mstyle_booking',
      role: 'primary',
    }),
    after: ({ body }) => {
      state.guestPartyId = pick(body, 'guestPartyId');
    },
  },
  {
    id: 'G-04',
    title: 'Guest status',
    scope: 'mstyle.guest.read',
    method: 'GET',
    path: () => `/guest-parties/${state.guestPartyId}/status`,
    after: ({ headers }) => {
      state.guestEtag = headers.etag || '';
    },
  },
  {
    id: 'G-11',
    title: 'Claim guest with If-Match',
    scope: 'mstyle.guest.claim',
    method: 'POST',
    path: () => `/guest-parties/${state.guestPartyId}/claim`,
    actor: 'resident',
    expectedStatuses: [401, 403, 404],
    body: () => ({
      schemaVersion,
      profileId: state.profileId,
      expectedGuestPartyRevision: Number(
        String(state.guestEtag).replace(/\D/g, ''),
      ),
    }),
  },
  ...(emailChallengeAddress
    ? [
        {
          id: 'A-03-email',
          title: 'Email code challenge',
          scope: 'mstyle.resident.authenticate',
          method: 'POST',
          path: '/auth/residents/code-challenges',
          body: () => ({
            schemaVersion,
            identifier: { type: 'email', value: emailChallengeAddress },
            channel: 'email',
            context: {
              ipAddress: '198.51.100.22',
              userAgent: 'pass24-v2-smoke/1.0',
              locale: 'ru-RU',
            },
          }),
        },
      ]
    : []),
];

function trimRight(value, char) {
  let out = String(value);
  while (out.endsWith(char)) out = out.slice(0, -1);
  return out;
}

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function hmacHex(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function adminAssertion(actor, purpose) {
  if (!adminAssertionSecret) {
    return 'smoke-assertion';
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      actor,
      purpose,
      iat: now,
      exp: now + 60,
      jti: crypto.randomUUID(),
    }),
  ).toString('base64url');
  return `v1.${payload}.${hmacHex(
    adminAssertionSecret,
    `mstyle-admin-assertion:${payload}`,
  )}`;
}

function makeAssertion(client) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: client.kid };
  const payload = {
    iss: client.clientId,
    sub: client.clientId,
    aud: tokenUrl,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + 60,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(
    JSON.stringify(payload),
  )}`;
  const signature = crypto.sign(
    'RSA-SHA256',
    Buffer.from(signingInput),
    fs.readFileSync(client.privateKeyPath),
  );
  return `${signingInput}.${b64url(signature)}`;
}

async function tokenFor(scope, client = backendClient) {
  const tokenKey = `${client.clientId}:${scope}`;
  if (state.tokens.has(tokenKey)) return state.tokens.get(tokenKey);
  const response = await postForm(tokenUrl, {
    grant_type: 'client_credentials',
    client_id: client.clientId,
    client_assertion_type:
      'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: makeAssertion(client),
    scope,
  });
  const body = parseJson(response.body);
  if (response.status < 200 || response.status >= 300 || !body.access_token) {
    throw new Error(
      `Token failed for ${scope}: HTTP ${response.status} ${JSON.stringify(
        redact(body),
      )}`,
    );
  }
  if (body.scope !== scope) {
    throw new Error(
      `Token scope mismatch: requested ${scope}, got ${body.scope}`,
    );
  }
  state.tokens.set(tokenKey, body.access_token);
  return body.access_token;
}

function postForm(url, body) {
  return request(
    'POST',
    url,
    {
      'content-type': 'application/x-www-form-urlencoded',
    },
    new URLSearchParams(body).toString(),
  );
}

function request(method, url, headers = {}, body) {
  return new Promise((resolve) => {
    const payload = body == null ? undefined : String(body);
    const req = https.request(
      url,
      {
        method,
        headers: {
          accept: 'application/json',
          ...headers,
          ...(payload == null
            ? {}
            : { 'content-length': Buffer.byteLength(payload) }),
        },
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: responseBody,
          });
        });
      },
    );
    req.on('error', (error) =>
      resolve({ status: 0, headers: {}, body: String(error) }),
    );
    if (payload != null) req.write(payload);
    req.end();
  });
}

function parseJson(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return { raw: String(value).slice(0, 500) };
  }
}

function redact(body) {
  if (Array.isArray(body)) return body.map(redact);
  if (!body || typeof body !== 'object') return body;
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => [
      key,
      /token|assertion|secret|password|code/i.test(key)
        ? 'hidden'
        : redact(value),
    ]),
  );
}

function pick(obj, key) {
  if (!obj || typeof obj !== 'object') return '';
  if (typeof obj[key] === 'string') return obj[key];
  for (const value of Object.values(obj)) {
    const found = pick(value, key);
    if (found) return found;
  }
  return '';
}

function ensureKeys(client) {
  const privateExists = fs.existsSync(client.privateKeyPath);
  const publicExists = fs.existsSync(client.publicKeyPath);
  if (!privateExists || !publicExists) {
    throw new Error(
      `Key files not found. private=${client.privateKeyPath} public=${client.publicKeyPath}`,
    );
  }
  const privateKey = fs.readFileSync(client.privateKeyPath);
  const publicKey = fs.readFileSync(client.publicKeyPath);
  const message = Buffer.from('pass24-mstyle-v2-smoke');
  const signature = crypto.sign('RSA-SHA256', message, privateKey);
  const matches = crypto.verify('RSA-SHA256', message, publicKey, signature);
  if (!matches) throw new Error('Private/public key pair does not match');
  return sha256Hex(publicKey);
}

async function runStep(step) {
  if (step.request) {
    await step.request();
    return {
      id: step.id,
      title: step.title,
      scope: step.scope,
      status: 200,
      ok: true,
      note: 'token received and hidden',
    };
  }
  const token = await tokenFor(step.scope, step.client || backendClient);
  const path = typeof step.path === 'function' ? step.path() : step.path;
  const url = `${baseUrl}${apiPrefix}${path}`;
  const json = step.body ? JSON.stringify(step.body()) : undefined;
  const headers = {
    authorization: `Bearer ${token}`,
    'X-Request-ID': `req_${crypto.randomUUID()}`,
    ...(step.method === 'GET'
      ? {}
      : { 'Idempotency-Key': `idem_${crypto.randomUUID()}` }),
    ...(json ? { 'content-type': 'application/json' } : {}),
    ...(step.headers ? step.headers() : {}),
    ...(step.actor === 'reconcile'
      ? { 'X-Actor-Ref': 'system:reconcile' }
      : {}),
    ...(step.actor === 'admin-review'
      ? {
          'X-Actor-Ref': 'wp-admin:smoke',
          'X-Admin-Step-Up-Assertion': adminAssertion(
            'wp-admin:smoke',
            'admin_support_review',
          ),
          'X-Purpose-Code': 'admin_support_review',
        }
      : {}),
    ...(step.actor === 'admin-onboarding'
      ? {
          'X-Actor-Ref': 'wp-admin:smoke',
          'X-Admin-Step-Up-Assertion': adminAssertion(
            'wp-admin:smoke',
            'resident_onboarding',
          ),
          'X-Purpose-Code': 'resident_onboarding',
        }
      : {}),
    ...(step.actor === 'resident'
      ? {
          'X-Resident-Subject': state.subject,
          'X-Actor-Ref': `resident:${state.subject}`,
          'X-Step-Up-Authentication-ID': 'aut_smoke',
        }
      : {}),
  };
  const response = await request(step.method, url, headers, json);
  const body = parseJson(response.body);
  const ok = step.expectedStatuses
    ? step.expectedStatuses.includes(response.status)
    : response.status >= 200 && response.status < 300;
  if (ok && step.after) step.after({ body, headers: response.headers });
  return {
    id: step.id,
    title: step.title,
    method: step.method,
    url,
    scope: step.scope,
    status: response.status,
    ok,
    requestId: response.headers['x-request-id'],
    etag: response.headers.etag,
    body: redact(body),
  };
}

async function main() {
  const publicPemSha256 = ensureKeys(backendClient);
  ensureKeys(reconcileClient);
  console.log(
    JSON.stringify(
      {
        baseUrl,
        tokenUrl,
        clientId: backendClient.clientId,
        kid: backendClient.kid,
        alg: 'RS256',
        publicPemSha256,
        privateKeyFile: backendClient.privateKeyPath,
        publicKeyFile: backendClient.publicKeyPath,
        accessTokensPrinted: false,
      },
      null,
      2,
    ),
  );

  let failed = false;
  for (const scope of M1_M2_SCOPES) {
    try {
      await tokenFor(scope, backendClient);
      console.log(
        JSON.stringify({ id: 'T-scope', scope, ok: true, status: 200 }, null, 2),
      );
    } catch (error) {
      failed = true;
      console.error(
        JSON.stringify(
          { id: 'T-scope', scope, ok: false, error: error.message },
          null,
          2,
        ),
      );
    }
  }
  for (const step of steps) {
    try {
      const result = await runStep(step);
      if (!result.ok) failed = true;
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      failed = true;
      console.error(
        JSON.stringify(
          {
            id: step.id,
            title: step.title,
            scope: step.scope,
            ok: false,
            error: error.message,
          },
          null,
          2,
        ),
      );
    }
  }
  process.exitCode = failed ? 1 : 0;
}

main();
