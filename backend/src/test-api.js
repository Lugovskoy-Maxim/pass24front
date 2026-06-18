/**
 * Простой интеграционный тест API. Запуск: node src/test-api.js
 */
const BASE = `http://localhost:${process.env.PORT || 4000}/api`;

async function req(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

let passed = 0;
let failed = 0;

function assert(name, cond, detail = '') {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`); }
}

async function run() {
  console.log('PASS24 API tests (Business Center)\n');

  assert('health ok', (await req('GET', '/health')).status === 200);

  const config = await req('GET', '/config');
  assert('public config', config.status === 200 && config.data.businessCenterName);

  const loginRes = await req('POST', '/auth/login', { email: 'tenant@pass24.local', password: 'tenant123' });
  assert('tenant login', loginRes.status === 200 && loginRes.data.token);
  const tenantToken = loginRes.data.token;

  const stats = await req('GET', '/passes/stats', null, tenantToken);
  assert('pass stats', stats.status === 200 && typeof stats.data.todayCount === 'number');

  const secLogin = await req('POST', '/auth/login', { email: 'security@pass24.local', password: 'security123' });
  assert('security login', secLogin.status === 200);
  const securityToken = secLogin.data.token;

  const badPass = await req('POST', '/passes', {
    visitorName: 'Test', passType: 'parking', visitDate: '2099-01-01', office: '101',
  }, tenantToken);
  assert('parking without plate rejected', badPass.status === 400);

  const create = await req('POST', '/passes', {
    visitorName: 'Тестовый посетитель', passType: 'visitor', visitDate: '2099-06-01',
    office: '401', floor: '4', companyName: 'ООО Тест', visitPurpose: 'Встреча',
    visitTimeFrom: '10:00', visitTimeTo: '12:00',
  }, tenantToken);
  assert('create pass', create.status === 201 && create.data.pass?.office === '401');
  const passId = create.data.pass?.id;
  const passNumber = create.data.pass?.passNumber;

  const lookup = await req('GET', `/passes/lookup/${passNumber}`, null, securityToken);
  assert('lookup pass', lookup.status === 200 && lookup.data.pass?.id === passId);

  const approve = await req('PATCH', `/passes/${passId}/status`, { status: 'approved' }, securityToken);
  assert('approve ok', approve.status === 200);

  const checkIn = await req('POST', `/passes/${passId}/check-in`, null, securityToken);
  assert('check-in ok', checkIn.status === 200);

  const checkOut = await req('POST', `/passes/${passId}/check-out`, null, securityToken);
  assert('check-out ok', checkOut.status === 200);

  const adminLogin = await req('POST', '/auth/login', { email: 'admin@pass24.local', password: 'admin123' });
  const adminToken = adminLogin.data.token;
  const dashboard = await req('GET', '/admin/dashboard', null, adminToken);
  assert('admin dashboard', dashboard.status === 200 && dashboard.data.stats);

  const bc = await req('GET', '/admin/business-centers', null, adminToken);
  assert('business centers', bc.status === 200 && bc.data.businessCenters?.length >= 1);

  const offices = await req('GET', '/admin/offices', null, adminToken);
  assert('offices list', offices.status === 200 && offices.data.offices?.length >= 1);

  const blacklistAdd = await req('POST', '/admin/blacklist', { plate: 'TEST999', reason: 'test' }, adminToken);
  assert('blacklist add', blacklistAdd.status === 201);

  const blacklist = await req('GET', '/admin/blacklist', null, adminToken);
  assert('blacklist list', blacklist.status === 200 && blacklist.data.entries?.some((e) => e.plate === 'TEST999'));

  const blockedPass = await req('POST', '/passes', {
    visitorName: 'Blocked', passType: 'parking', visitDate: '2099-06-02',
    office: '401', floor: '4', vehiclePlate: 'TEST999',
  }, tenantToken);
  assert('blacklisted plate rejected', blockedPass.status === 403);

  const report = await req('GET', '/admin/reports/daily?date=2099-06-01', null, adminToken);
  assert('daily report', report.status === 200 && report.data.date === '2099-06-01');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => { console.error(err.message); process.exit(1); });