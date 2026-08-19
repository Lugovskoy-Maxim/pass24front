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
  request?: unknown;
};

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api';
const SV = '2.0';
const V2 = '/internal/integrations/mstyle/v2';
const MOCK_OTP = '123456';
const CTX = {
  ipAddress: '192.0.2.10',
  userAgent: 'Pass admin api-console',
  locale: 'ru-RU',
};

function jwt(): string {
  return typeof window === 'undefined'
    ? ''
    : localStorage.getItem('pass24_token') || '';
}

function rid() {
  return `req_${Math.random().toString(36).slice(2, 10)}`;
}

function idem() {
  return `idem_${Math.random().toString(36).slice(2, 14)}`;
}

type RawOpts = {
  body?: unknown;
  token?: string;
  form?: string;
  headers?: Record<string, string>;
};

async function raw(
  method: string,
  path: string,
  opts: RawOpts = {},
): Promise<{ status: number; ok: boolean; ms: number; body: unknown; url: string }> {
  const url = path.startsWith('http') ? path : `${API}${path.startsWith('/') ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-ID': rid(),
    ...(opts.headers || {}),
  };
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
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  for (const v of Object.values(rec)) {
    if (v && typeof v === 'object') {
      const nested = pick(v, ...keys);
      if (nested) return nested;
    }
  }
  return '';
}

function pickNum(obj: unknown, key: string, fallback = 1): number {
  if (!obj || typeof obj !== 'object') return fallback;
  const rec = obj as Record<string, unknown>;
  const v = rec[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  for (const child of Object.values(rec)) {
    if (child && typeof child === 'object') {
      const nested = pickNum(child, key, Number.NaN);
      if (Number.isFinite(nested)) return nested;
    }
  }
  return fallback;
}

function makeStep(onStep: (step: ProbeStep) => void) {
  return async (
    ver: 'v1' | 'v2',
    id: string,
    title: string,
    method: string,
    path: string,
    opts?: RawOpts & { okStatuses?: number[] },
  ) => {
    const { okStatuses, ...rawOpts } = opts || {};
    const res = await raw(method, path, rawOpts);
    const ok = okStatuses ? okStatuses.includes(res.status) : res.ok;
    onStep({
      ver,
      id,
      title,
      method,
      ...res,
      ok,
      request: rawOpts.form != null ? rawOpts.form : rawOpts.body,
    });
    return res;
  };
}

export async function runV1ApiCycle(onStep: (step: ProbeStep) => void): Promise<void> {
  const stamp = Date.now().toString(36);
  const adminJwt = jwt();
  const visitDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const v1Email = `probe-${stamp}@pass24.test`;
  const v1Password = 'Probe12!';
  const step = makeStep(onStep);

  let bcId = '';
  let officeId = '';
  let userId = '';
  let passId = '';

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
  bcId = pick(bc.body, 'id');

  if (bcId) {
    await step('v1', 'AD-16', 'update BC', 'PATCH', `/admin/business-centers/${bcId}`, {
      token: adminJwt,
      body: { address: 'probe cycle updated' },
    });
    const office = await step('v1', 'AD-22', 'create office', 'POST', '/admin/offices', {
      token: adminJwt,
      body: { propertyId: bcId, number: `P${stamp.slice(-4)}` },
    });
    officeId = pick(office.body, 'id');
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
      email: v1Email,
      password: v1Password,
      lastName: 'Probe',
      firstName: 'Cycle',
      fullName: 'Probe Cycle',
      role: 'tenant',
      company: `probe-${stamp}`,
      emailVerified: true,
      officeIds: officeId ? [officeId] : undefined,
    },
  });
  userId = pick(user.body, 'id');

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
    passId = pick(pass.body, 'id');
  }

  if (passId) {
    await step('v1', 'P1-12', 'update pass status', 'PATCH', `/passes/${passId}/status`, {
      token: adminJwt,
      body: { status: 'approved' },
    });
    await step('v1', 'P1-13', 'update visitor', 'PATCH', `/passes/${passId}/visitor-data`, {
      token: adminJwt,
      body: {
        visitorPassportSeries: '4510',
        visitorPassportNumber: '123456',
        visitorPassportIssuedBy: 'ОВД probe',
      },
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
}

export async function runV2ApiCycle(
  clientId: string,
  onStep: (step: ProbeStep) => void,
): Promise<void> {
  const stamp = Date.now().toString(36);
  const adminJwt = jwt();
  const v1Email = `probe-a02-${stamp}@pass24.test`;
  const v1Password = 'Probe12!';
  const v2Email = `probe-v2-${stamp}@pass24.test`;
  const empEmail = `probe-emp-${stamp}@pass24.test`;
  const guestEmail = `probe-gst-${stamp}@pass24.test`;
  const phone = `+7999${String(Date.now()).slice(-7)}`;
  const step = makeStep(onStep);
  let svc = '';

  const v2 = (
    id: string,
    title: string,
    method: string,
    path: string,
    opts?: RawOpts & { okStatuses?: number[]; idempotent?: boolean },
  ) => {
    const { idempotent, ...rest } = opts || {};
    const headers = { ...(rest.headers || {}) };
    if (idempotent) headers['Idempotency-Key'] = idem();
    return step('v2', id, title, method, `${V2}${path}`, {
      ...rest,
      token: rest.token ?? svc,
      headers,
    });
  };

  let subject = '';
  let profileId = '';
  let ownerMembershipId = '';
  let employeeMembershipId = '';
  let employeeSubject = '';
  let guestId = '';
  let snapshotId = '';
  let guestSnapshotId = '';
  let contactId = '';
  let challengeId = '';
  let contactChallengeId = '';
  let guestChallengeId = '';
  let changeRequestId = '';
  let deletionRequestId = '';
  let helperUserId = '';

  const helper = await raw('POST', '/admin/users', {
    token: adminJwt,
    body: {
      email: v1Email,
      password: v1Password,
      lastName: 'Probe',
      firstName: 'Auth',
      fullName: 'Probe Auth',
      role: 'tenant',
      company: `probe-${stamp}`,
      emailVerified: true,
    },
  });
  helperUserId = pick(helper.body, 'id');

  try {
  const tok = await step('v2', 'A-01', 'service token', 'POST', '/oauth2/token', {
    form: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId || 'mstyle-backend-staging',
    }).toString(),
  });
  svc = pick(tok.body, 'access_token');
  if (!svc) return;

  await v2('A-02', 'verify password', 'POST', '/auth/residents/password-verify', {
    idempotent: true,
    body: {
      schemaVersion: SV,
      login: v1Email,
      password: v1Password,
      context: CTX,
    },
  });

  const onboard = await v2('R-08', 'onboard profile', 'POST', '/resident-onboarding', {
    body: {
      schemaVersion: SV,
      profileType: 'company',
      legalForm: 'ooo',
      label: `probe-${stamp}`,
      owner: {
        identifier: { type: 'email', value: v2Email },
        displayName: `Probe ${stamp}`,
        name: { lastName: 'Probe', firstName: 'V2' },
      },
    },
  });
  subject = pick(onboard.body, 'subject');
  profileId = pick(onboard.body, 'profileId');
  ownerMembershipId = pick(onboard.body, 'ownerMembershipId');

  const started = await v2('A-03', 'start code login', 'POST', '/auth/residents/code-challenges', {
    idempotent: true,
    body: {
      schemaVersion: SV,
      identifier: { type: 'email', value: v2Email },
      channel: 'email',
      context: CTX,
    },
  });
  challengeId = pick(started.body, 'challengeId') || 'ach_probe_missing';
  subject = subject || 'usr_probe_missing';
  profileId = profileId || 'prf_probe_missing';
  ownerMembershipId = ownerMembershipId || 'mem_probe_missing';

  await v2('A-04', 'challenge status', 'GET', `/auth/residents/code-challenges/${challengeId}`);
  await v2('A-05', 'resend code', 'POST', `/auth/residents/code-challenges/${challengeId}/resend`, {
    idempotent: true,
    okStatuses: [202, 429],
  });
  await v2('A-06', 'verify code', 'POST', `/auth/residents/code-challenges/${challengeId}/verify`, {
    idempotent: true,
    body: { schemaVersion: SV, code: MOCK_OTP, context: CTX },
  });

  await v2('R-01', 'resident context', 'GET', `/residents/${subject}/context`);
  await v2('R-07', 'patch identity', 'PATCH', `/residents/${subject}/identity`, {
    body: {
      schemaVersion: SV,
      displayName: `Probe ${stamp} u`,
      name: { lastName: 'Probe', firstName: 'V2', middleName: 'Cycle' },
    },
  });
  await v2('R-14', 'get identity', 'GET', `/identities/${subject}`);
  await v2('R-03', 'change feed', 'GET', '/changes?limit=20');
  await v2('R-05', 'patch profile', 'PATCH', `/resident-profiles/${profileId}`, {
    body: {
      schemaVersion: SV,
      label: `probe-${stamp}-u`,
      companyShortName: `probe-${stamp}`,
      memberPolicy: { employeeLimit: 5 },
    },
  });
  await v2('R-04', 'get profile', 'GET', `/resident-profiles/${profileId}`);
  await v2('R-09', 'activate profile', 'POST', `/resident-profiles/${profileId}/lifecycle-transitions`, {
    body: { schemaVersion: SV, transition: 'activate' },
  });
  await v2('R-13', 'physical access', 'GET', `/resident-profiles/${profileId}/physical-access`);
  await v2('R-06', 'search profiles', 'POST', '/resident-profiles/search', {
    body: { schemaVersion: SV, query: { label: `probe-${stamp}` }, limit: 20 },
  });

  await v2('M-01', 'list memberships', 'GET', `/resident-profiles/${profileId}/memberships`);
  const emp = await v2('M-02', 'add employee', 'POST', `/resident-profiles/${profileId}/memberships`, {
    body: {
      schemaVersion: SV,
      identifier: { type: 'email', value: empEmail },
      displayName: `Probe Emp ${stamp}`,
    },
  });
  employeeMembershipId = pick(emp.body, 'membershipId') || pick(emp.body, 'id') || 'mem_emp_missing';
  employeeSubject = pick(emp.body, 'subject') || 'usr_emp_missing';

  await v2('M-03', 'patch membership', 'PATCH', `/resident-memberships/${employeeMembershipId}`, {
    body: { schemaVersion: SV, status: 'active' },
  });
  const transfer = await v2(
    'M-05',
    'transfer owner',
    'POST',
    `/resident-profiles/${profileId}/owner-transfer`,
    { body: { schemaVersion: SV, newOwnerSubject: employeeSubject } },
  );
  const revokeId = transfer.ok ? ownerMembershipId : employeeMembershipId;
  await v2('M-04', 'revoke membership', 'POST', `/resident-memberships/${revokeId}/revoke`);

  const cch = await v2('C-01', 'contact challenge', 'POST', `/residents/${subject}/contacts/challenges`, {
    body: { schemaVersion: SV, type: 'phone', value: phone },
  });
  contactChallengeId = pick(cch.body, 'challengeId') || 'cch_probe_missing';
  const verified = await v2(
    'C-02',
    'verify contact',
    'POST',
    `/residents/${subject}/contacts/challenges/${contactChallengeId}/verify`,
    { body: { schemaVersion: SV, code: MOCK_OTP } },
  );
  contactId = pick(verified.body, 'contactId');
  const revealed = await v2('C-05', 'reveal contacts', 'POST', `/residents/${subject}/contacts/reveal`);
  if (!contactId) contactId = pick(revealed.body, 'contactId');

  const assigns = await v2(
    'C-03',
    'list assignments',
    'GET',
    `/resident-profiles/${profileId}/contact-assignments`,
  );
  const revision = pickNum(assigns.body, 'assignmentSetRevision', 1);
  await v2('C-04', 'replace assignments', 'PATCH', `/resident-profiles/${profileId}/contact-assignments`, {
    body: {
      schemaVersion: SV,
      assignmentSetRevision: revision,
      items: contactId
        ? [
            {
              purpose: 'primary',
              subject,
              contactId,
              priority: 1,
              status: 'active',
            },
          ]
        : [],
    },
  });

  await v2('S-01', 'list consents', 'GET', `/residents/${subject}/consents`);
  await v2('S-02', 'accept consent', 'POST', `/residents/${subject}/consents/pdn/accept`, {
    body: {
      schemaVersion: SV,
      documentVersion: '1.0',
      documentDigest: 'sha256:probe',
      documentUrl: 'https://pass.mstyle.ru/pdn',
      locale: 'ru',
    },
  });
  await v2('S-03', 'withdraw consent', 'POST', `/residents/${subject}/consents/pdn/withdraw`);

  await v2('P-03', 'patch private-data', 'PATCH', `/resident-profiles/${profileId}/private-data`, {
    body: {
      schemaVersion: SV,
      values: {
        companyFullName: `ООО Probe ${stamp}`,
        companyShortName: `Probe ${stamp}`,
        inn: '7700000000',
        ogrn: '1027700000000',
      },
    },
  });
  await v2('P-01', 'private-data status', 'GET', `/resident-profiles/${profileId}/private-data/status`);
  await v2('P-02', 'reveal private-data', 'POST', `/resident-profiles/${profileId}/private-data/reveal`, {
    body: { schemaVersion: SV, fieldCodes: ['companyFullName', 'inn', 'ogrn'] },
  });
  const snap = await v2(
    'P-04',
    'create snapshot',
    'POST',
    `/resident-profiles/${profileId}/private-data/snapshots`,
  );
  snapshotId = pick(snap.body, 'snapshotId') || 'snp_probe_missing';
  await v2('P-05', 'reveal profile contacts', 'POST', `/resident-profiles/${profileId}/contacts/reveal`);
  await v2('P-06', 'reveal snapshot', 'POST', `/private-data-snapshots/${snapshotId}/reveal`, {
    body: { schemaVersion: SV, fieldCodes: ['inn', 'ogrn'] },
  });
  await v2(
    'P-07',
    'reveal snapshot contacts',
    'POST',
    `/private-data-snapshots/${snapshotId}/contacts/reveal`,
  );
  await v2('P-08', 'bind snapshot', 'POST', `/private-data-snapshots/${snapshotId}/operation-bindings`, {
    body: { schemaVersion: SV, operationRef: `op_probe_${stamp}` },
  });

  const cr1 = await v2(
    'R-11',
    'create change request',
    'POST',
    `/resident-profiles/${profileId}/change-requests`,
    {
      body: {
        schemaVersion: SV,
        fieldCodes: ['companyShortName'],
        values: { companyShortName: `probe-${stamp}-cr` },
        reasonCode: 'probe_cycle',
      },
    },
  );
  changeRequestId = pick(cr1.body, 'changeRequestId') || 'crq_probe_missing';
  await v2(
    'R-12',
    'current change request',
    'GET',
    `/resident-profiles/${profileId}/change-requests/current`,
  );
  await v2(
    'R-16',
    'cancel change request',
    'POST',
    `/resident-profile-change-requests/${changeRequestId}/cancel`,
  );
  const cr2 = await v2(
    'R-11b',
    'create change request 2',
    'POST',
    `/resident-profiles/${profileId}/change-requests`,
    {
      body: {
        schemaVersion: SV,
        fieldCodes: ['inn'],
        values: { inn: '7700000001' },
        reasonCode: 'probe_cycle',
      },
    },
  );
  const cr2Id = pick(cr2.body, 'changeRequestId') || 'crq_probe_missing_2';
  await v2(
    'R-15',
    'decide change request',
    'POST',
    `/resident-profile-change-requests/${cr2Id}/decisions`,
    { body: { schemaVersion: SV, decision: 'approve' } },
  );

  const guest = await v2('G-01', 'create guest', 'POST', '/guest-parties', {
    body: { schemaVersion: SV, purpose: `probe-${stamp}`, role: 'primary' },
  });
  guestId = pick(guest.body, 'guestPartyId') || pick(guest.body, 'id') || 'gst_probe_missing';

  const gch = await v2(
    'G-02',
    'guest contact challenge',
    'POST',
    `/guest-parties/${guestId}/contact-challenges`,
    { body: { schemaVersion: SV, type: 'email', value: guestEmail } },
  );
  guestChallengeId = pick(gch.body, 'challengeId') || 'gch_probe_missing';
  await v2(
    'G-03',
    'verify guest contact',
    'POST',
    `/guest-parties/${guestId}/contact-challenges/${guestChallengeId}/verify`,
    { body: { schemaVersion: SV, code: MOCK_OTP } },
  );
  await v2('G-04', 'guest status', 'GET', `/guest-parties/${guestId}/status`);
  await v2('G-05', 'reveal guest contacts', 'POST', `/guest-parties/${guestId}/contacts/reveal`);
  await v2('G-08', 'patch guest private-data', 'PATCH', `/guest-parties/${guestId}/private-data`, {
    body: {
      schemaVersion: SV,
      values: { lastName: 'Probe', firstName: 'Guest', displayName: `Probe Guest ${stamp}` },
    },
  });
  await v2('G-06', 'guest private-data status', 'GET', `/guest-parties/${guestId}/private-data/status`);
  await v2('G-07', 'reveal guest private-data', 'POST', `/guest-parties/${guestId}/private-data/reveal`, {
    body: { schemaVersion: SV, fieldCodes: ['lastName', 'firstName', 'displayName'] },
  });
  const gsnap = await v2('G-09', 'guest snapshot', 'POST', `/guest-parties/${guestId}/snapshots`);
  guestSnapshotId = pick(gsnap.body, 'snapshotId') || 'snp_guest_missing';
  await v2('G-10', 'confirm booking', 'POST', `/guest-parties/${guestId}/booking-confirmations`, {
    body: {
      schemaVersion: SV,
      operationRef: `book_probe_${stamp}`,
      snapshotId: guestSnapshotId,
    },
  });
  await v2('G-11', 'claim guest', 'POST', `/guest-parties/${guestId}/claim`, {
    body: {
      schemaVersion: SV,
      subject,
      claimedProfileId: profileId.startsWith('prf_probe_missing') ? undefined : profileId,
    },
  });
  await v2('G-13', 'guest consents', 'GET', `/guest-parties/${guestId}/consents`);
  await v2(
    'G-14',
    'accept guest consent',
    'POST',
    `/guest-parties/${guestId}/consents/guest_pdn/accept`,
    {
      body: {
        schemaVersion: SV,
        documentVersion: '1.0',
        documentDigest: 'sha256:probe',
        locale: 'ru',
      },
    },
  );
  await v2(
    'G-15',
    'withdraw guest consent',
    'POST',
    `/guest-parties/${guestId}/consents/guest_pdn/withdraw`,
  );
  await v2('G-12', 'search guests', 'POST', '/guest-parties/search', {
    body: { schemaVersion: SV, query: { guestPartyId: guestId }, limit: 20 },
  });

  const del = await v2(
    'R-10',
    'deletion request',
    'POST',
    `/resident-profiles/${profileId}/deletion-requests`,
    { body: { schemaVersion: SV, reasonCodes: ['probe_cycle'] } },
  );
  deletionRequestId = pick(del.body, 'deletionRequestId') || 'del_probe_missing';
  await v2('R-17', 'get deletion request', 'GET', `/deletion-requests/${deletionRequestId}`);
  } finally {
    if (helperUserId) {
      await raw('DELETE', `/admin/users/${helperUserId}`, { token: adminJwt });
    }
  }
}
