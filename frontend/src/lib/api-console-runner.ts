export type ProbeStep = {
  ver: 'v1' | 'v2';
  id: string;
  title: string;
  method: string;
  url: string;
  status: number;
  ok: boolean;
  ms: number;
  body: unknown;
};

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api';
const SV = '2.0';

function jwt(): string {
  return typeof window === 'undefined'
    ? ''
    : localStorage.getItem('pass24_token') || '';
}

function rid() {
  return `req_${Math.random().toString(36).slice(2, 10)}`;
}

async function raw(
  method: string,
  path: string,
  opts: { body?: unknown; token?: string; form?: string } = {},
): Promise<{ status: number; ok: boolean; ms: number; body: unknown; url: string }> {
  const url = path.startsWith('http') ? path : `${API}${path.startsWith('/') ? path : `/${path}`}`;
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Request-ID': rid() };
  let body: string | undefined;
  if (opts.form != null) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const t0 = performance.now();
  try {
    const res = await fetch(url, { method, headers, body });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* raw */
    }
    return {
      status: res.status,
      ok: res.ok,
      ms: Math.round(performance.now() - t0),
      body: parsed,
      url,
    };
  } catch (err) {
    return {
      status: 0,
      ok: false,
      ms: Math.round(performance.now() - t0),
      body: err instanceof Error ? err.message : String(err),
      url,
    };
  }
}

function pick(obj: unknown, ...keys: string[]): string {
  if (!obj || typeof obj !== 'object') return '';
  const rec = obj as Record<string, unknown>;
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === 'string' && v) return v;
  }
  for (const v of Object.values(rec)) {
    if (v && typeof v === 'object') {
      const nested = pick(v, ...keys);
      if (nested) return nested;
    }
  }
  return '';
}

export async function runFullApiCycle(
  clientId: string,
  onStep: (step: ProbeStep) => void,
): Promise<void> {
  const stamp = Date.now().toString(36);
  const adminJwt = jwt();
  const visitDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const step = async (
    ver: 'v1' | 'v2',
    id: string,
    title: string,
    method: string,
    path: string,
    opts?: { body?: unknown; token?: string; form?: string },
  ) => {
    const res = await raw(method, path, opts);
    onStep({ ver, id, title, method, url: res.url, ...res });
    return res;
  };

  let bcId = '';
  let officeId = '';
  let userId = '';
  let passId = '';
  let svc = '';
  let subject = '';
  let profileId = '';
  let guestId = '';

  await step('v1', 'C-00', 'config', 'GET', '/config');
  await step('v1', 'H-01', 'root', 'GET', '/');
  await step('v1', 'A1-11', 'me', 'GET', '/auth/me', { token: adminJwt });
  await step('v1', 'AD-01', 'dashboard', 'GET', '/admin/dashboard', {
    token: adminJwt,
  });

  const bc = await step('v1', 'AD-17', 'create BC', 'POST', '/admin/business-centers', {
    token: adminJwt,
    body: { name: `probe-bc-${stamp}`, address: 'probe cycle' },
  });
  bcId = pick(bc.body, 'id') || pick((bc.body as { businessCenter?: { id?: string } })?.businessCenter, 'id');

  if (bcId) {
    await step('v1', 'AD-16', 'update BC', 'PATCH', `/admin/business-centers/${bcId}`, {
      token: adminJwt,
      body: { address: 'probe cycle updated' },
    });
    const office = await step('v1', 'AD-22', 'create office', 'POST', '/admin/offices', {
      token: adminJwt,
      body: { propertyId: bcId, number: `P${stamp.slice(-4)}` },
    });
    officeId =
      pick(office.body, 'id') ||
      pick((office.body as { office?: { id?: string } })?.office, 'id');
  }

  if (officeId) {
    await step('v1', 'AD-23', 'update office', 'PATCH', `/admin/offices/${officeId}`, {
      token: adminJwt,
      body: { company: `probe-${stamp}` },
    });
  }

  const user = await step('v1', 'AD-06', 'create user', 'POST', '/admin/users', {
    token: adminJwt,
    body: {
      email: `probe-${stamp}@pass24.test`,
      password: 'Probe12!',
      lastName: 'Probe',
      firstName: 'Cycle',
      fullName: 'Probe Cycle',
      role: 'tenant',
      company: `probe-${stamp}`,
      emailVerified: true,
      officeIds: officeId ? [officeId] : undefined,
    },
  });
  userId = pick(user.body, 'id') || pick((user.body as { user?: { id?: string } })?.user, 'id');

  if (userId) {
    await step('v1', 'AD-07', 'update user', 'PATCH', `/admin/users/${userId}`, {
      token: adminJwt,
      body: { company: `probe-${stamp}-u` },
    });
  }

  if (officeId) {
    const pass = await step('v1', 'P1-11', 'create pass', 'POST', '/passes', {
      token: adminJwt,
      body: {
        visitorName: `Probe ${stamp}`,
        passType: 'visitor',
        visitDate,
        officeId,
      },
    });
    passId = pick(pass.body, 'id') || pick((pass.body as { pass?: { id?: string } })?.pass, 'id');
  }

  if (passId) {
    await step('v1', 'P1-12', 'update pass status', 'PATCH', `/passes/${passId}/status`, {
      token: adminJwt,
      body: { status: 'approved' },
    });
    await step('v1', 'P1-13', 'update visitor', 'PATCH', `/passes/${passId}/visitor-data`, {
      token: adminJwt,
      body: { visitorName: `Probe ${stamp} edited` },
    });
  }

  await step('v1', 'P1-01', 'list passes', 'GET', '/passes', { token: adminJwt });
  await step('v1', 'AD-19', 'list offices', 'GET', '/admin/offices', { token: adminJwt });

  if (userId) {
    await step('v1', 'AD-08', 'delete user', 'DELETE', `/admin/users/${userId}`, {
      token: adminJwt,
    });
  }
  if (officeId) {
    await step('v1', 'AD-24', 'delete office', 'DELETE', `/admin/offices/${officeId}`, {
      token: adminJwt,
    });
  }
  if (bcId) {
    await step('v1', 'AD-18', 'delete BC', 'DELETE', `/admin/business-centers/${bcId}`, {
      token: adminJwt,
    });
  }

  const tok = await step('v2', 'A-01', 'service token', 'POST', '/oauth2/token', {
    form: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId || 'mstyle-backend-staging',
    }).toString(),
  });
  svc = pick(tok.body, 'access_token');
  if (!svc) return;

  const onboard = await step('v2', 'R-08', 'onboard profile', 'POST', '/internal/integrations/mstyle/v2/resident-onboarding', {
    token: svc,
    body: {
      schemaVersion: SV,
      profileType: 'company',
      legalForm: 'ooo',
      label: `probe-${stamp}`,
      owner: {
        identifier: { type: 'email', value: `probe-v2-${stamp}@pass24.test` },
        displayName: `Probe ${stamp}`,
        name: { lastName: 'Probe', firstName: 'V2' },
      },
    },
  });
  subject = pick(onboard.body, 'subject');
  profileId = pick(onboard.body, 'profileId');

  if (profileId) {
    await step('v2', 'R-05', 'update profile', 'PATCH', `/internal/integrations/mstyle/v2/resident-profiles/${profileId}`, {
      token: svc,
      body: { schemaVersion: SV, label: `probe-${stamp}-u` },
    });
    await step('v2', 'P-03', 'update private-data', 'PATCH', `/internal/integrations/mstyle/v2/resident-profiles/${profileId}/private-data`, {
      token: svc,
      body: {
        schemaVersion: SV,
        values: {
          companyFullName: `ООО Probe ${stamp}`,
          inn: '7700000000',
          ogrn: '1027700000000',
        },
      },
    });
    await step('v2', 'R-04', 'get profile', 'GET', `/internal/integrations/mstyle/v2/resident-profiles/${profileId}`, {
      token: svc,
    });
    await step('v2', 'R-09', 'suspend profile', 'POST', `/internal/integrations/mstyle/v2/resident-profiles/${profileId}/lifecycle-transitions`, {
      token: svc,
      body: { schemaVersion: SV, transition: 'suspend' },
    });
    await step('v2', 'R-09b', 'activate profile', 'POST', `/internal/integrations/mstyle/v2/resident-profiles/${profileId}/lifecycle-transitions`, {
      token: svc,
      body: { schemaVersion: SV, transition: 'activate' },
    });
  }

  if (subject) {
    await step('v2', 'R-01', 'context', 'GET', `/internal/integrations/mstyle/v2/residents/${subject}/context`, {
      token: svc,
    });
  }

  const guest = await step('v2', 'G-01', 'create guest', 'POST', '/internal/integrations/mstyle/v2/guest-parties', {
    token: svc,
    body: { schemaVersion: SV, purpose: `probe-${stamp}` },
  });
  guestId = pick(guest.body, 'guestPartyId') || pick(guest.body, 'id');

  if (guestId) {
    await step('v2', 'G-08', 'update guest private-data', 'PATCH', `/internal/integrations/mstyle/v2/guest-parties/${guestId}/private-data`, {
      token: svc,
      body: {
        schemaVersion: SV,
        values: { lastName: 'Probe', firstName: 'Guest' },
      },
    });
    await step('v2', 'G-04', 'guest status', 'GET', `/internal/integrations/mstyle/v2/guest-parties/${guestId}/status`, {
      token: svc,
    });
  }

  if (profileId) {
    await step('v2', 'R-10', 'delete profile request', 'POST', `/internal/integrations/mstyle/v2/resident-profiles/${profileId}/deletion-requests`, {
      token: svc,
      body: { schemaVersion: SV, reasonCodes: ['probe_cycle'] },
    });
  }

  await step('v2', 'R-06', 'search profiles', 'POST', '/internal/integrations/mstyle/v2/resident-profiles/search', {
    token: svc,
    body: { schemaVersion: SV, query: {}, limit: 20 },
  });
  await step('v2', 'G-12', 'search guests', 'POST', '/internal/integrations/mstyle/v2/guest-parties/search', {
    token: svc,
    body: { schemaVersion: SV, query: {}, limit: 20 },
  });
}
