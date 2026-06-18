/**
 * Простой интеграционный тест API. Запуск: node src/test-api.js
 * Требует запущенный сервер на PORT (по умолчанию 4000).
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
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`);
  }
}

async function run() {
  console.log('PASS24 API tests\n');

  const health = await req('GET', '/health');
  assert('health ok', health.status === 200 && health.data.status === 'ok');

  const loginRes = await req('POST', '/auth/login', { email: 'resident@pass24.local', password: 'resident123' });
  assert('resident login', loginRes.status === 200 && loginRes.data.token);
  const residentToken = loginRes.data.token;

  const secLogin = await req('POST', '/auth/login', { email: 'security@pass24.local', password: 'security123' });
  assert('security login', secLogin.status === 200);
  const securityToken = secLogin.data.token;

  const badPass = await req('POST', '/passes', {
    guestName: 'Test', passType: 'vehicle', visitDate: '2099-01-01', apartment: '1',
  }, residentToken);
  assert('vehicle without plate rejected', badPass.status === 400);

  const badTime = await req('POST', '/passes', {
    guestName: 'Test', passType: 'guest', visitDate: '2099-01-01', apartment: '1',
    visitTimeFrom: '18:00', visitTimeTo: '10:00',
  }, residentToken);
  assert('invalid time range rejected', badTime.status === 400);

  const create = await req('POST', '/passes', {
    guestName: 'Тестовый гость', passType: 'guest', visitDate: '2099-06-01',
    apartment: '42', visitTimeFrom: '10:00', visitTimeTo: '12:00',
  }, residentToken);
  assert('create pass', create.status === 201 && create.data.pass?.id);
  const passId = create.data.pass?.id;

  const doubleApprove = await req('PATCH', `/passes/${passId}/status`, { status: 'approved' }, securityToken);
  assert('first approve ok', doubleApprove.status === 200);

  const reApprove = await req('PATCH', `/passes/${passId}/status`, { status: 'approved' }, securityToken);
  assert('double approve rejected', reApprove.status === 400);

  const checkIn = await req('POST', `/passes/${passId}/check-in`, null, securityToken);
  assert('check-in ok', checkIn.status === 200 && checkIn.data.pass?.status === 'active');

  const doubleCheckIn = await req('POST', `/passes/${passId}/check-in`, null, securityToken);
  assert('double check-in rejected', doubleCheckIn.status === 400);

  const checkOut = await req('POST', `/passes/${passId}/check-out`, null, securityToken);
  assert('check-out ok', checkOut.status === 200 && checkOut.data.pass?.status === 'completed');

  const journal = await req('GET', '/passes/journal?date=2099-06-01', null, securityToken);
  assert('journal includes stats', journal.status === 200 && typeof journal.data.stats?.pending === 'number');

  const residentJournal = await req('GET', '/passes/journal', null, residentToken);
  assert('resident cannot access journal', residentJournal.status === 403);

  const adminLogin = await req('POST', '/auth/login', { email: 'admin@pass24.local', password: 'admin123' });
  assert('admin login', adminLogin.status === 200);
  const adminToken = adminLogin.data.token;

  const dashboard = await req('GET', '/admin/dashboard', null, adminToken);
  assert('admin dashboard', dashboard.status === 200 && dashboard.data.stats);

  const pricing = await req('GET', '/admin/pricing', null, adminToken);
  assert('admin pricing', pricing.status === 200 && pricing.data.plans?.length >= 3);

  const residentAdmin = await req('GET', '/admin/dashboard', null, residentToken);
  assert('resident cannot access admin', residentAdmin.status === 403);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test runner error:', err.message);
  process.exit(1);
});