'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_GATEWAY_TOKEN = 'test-gateway-token';
process.env.MSTYLE_TELEGRAM_BOT = 'm_style_office_bot';
const { server, initializeBot, handleMessage, pendingByStart, startByChat } = require('./server');
const realFetch = global.fetch;
let calls;
let failSend;
let botUsername;
let webhookUrl;

beforeEach(() => {
  calls = [];
  failSend = false;
  botUsername = 'm_style_office_bot';
  webhookUrl = '';
  pendingByStart.clear();
  startByChat.clear();
  global.fetch = async (url, options) => {
    const method = url.split('/').pop();
    const body = JSON.parse(options.body);
    calls.push({ method, body });
    if (failSend && method === 'sendMessage') throw new Error('network unavailable');
    const result = method === 'getMe' ? { username: botUsername }
      : method === 'getWebhookInfo' ? { url: webhookUrl } : {};
    return { ok: true, json: async () => ({ ok: true, result }) };
  };
});
afterEach(() => { global.fetch = realFetch; });

function pending() {
  pendingByStart.set('test_start', { code: '4321', phone: '+79990001234', expiresAt: Date.now() + 60000 });
}
function message(fields = {}) {
  return { chat: { id: 123, type: 'private' }, from: { id: 123 }, ...fields };
}
function contact(phone = '79990001234', userId = 123) {
  return message({ contact: { user_id: userId, phone_number: phone } });
}

test('start requests a contact, then matching own contact receives the OTP once', async () => {
  pending();
  await handleMessage(message({ text: '/start test_start' }));
  assert.equal(calls[0].body.reply_markup.keyboard[0][0].request_contact, true);
  assert.ok(!calls[0].body.text.includes('4321'));
  await handleMessage(contact());
  assert.ok(calls[1].body.text.includes('4321'));
  assert.equal(pendingByStart.size, 0);
  await handleMessage(contact());
  assert.equal(calls.filter(c => c.body.text?.includes('4321')).length, 1);
});

test('foreign contacts and mismatched numbers do not receive a code', async () => {
  pending();
  startByChat.set(123, 'test_start');
  await handleMessage(contact('79990001234', 999));
  await handleMessage(contact('79990009999'));
  assert.ok(calls.every(c => !c.body.text.includes('4321')));
  assert.equal(pendingByStart.size, 1);
});

test('group chats and typed phone numbers cannot obtain a code', async () => {
  pending();
  startByChat.set(123, 'test_start');
  await handleMessage({ ...contact(), chat: { id: 123, type: 'group' } });
  await handleMessage(message({ text: '+79990001234' }));
  assert.equal(calls.length, 0);
});

test('expired codes are not delivered', async () => {
  pending();
  pendingByStart.get('test_start').expiresAt = Date.now() - 1;
  startByChat.set(123, 'test_start');
  await handleMessage(contact());
  assert.ok(calls.every(c => !c.body.text.includes('4321')));
  assert.equal(pendingByStart.size, 0);
});

test('failed delivery retains the code so contact submission can be retried', async () => {
  pending();
  startByChat.set(123, 'test_start');
  failSend = true;
  await assert.rejects(handleMessage(contact()), /network unavailable/);
  assert.equal(pendingByStart.size, 1);
  failSend = false;
  await handleMessage(contact());
  assert.equal(pendingByStart.size, 0);
});

test('startup checks the actual bot username and active webhook', async () => {
  botUsername = 'wrong_bot';
  await assert.rejects(initializeBot(), /does not match/);
  botUsername = 'm_style_office_bot';
  webhookUrl = 'https://example.com/webhook';
  await assert.rejects(initializeBot(), /Webhook is active/);
  webhookUrl = '';
  await initializeBot();
});

test('HTTP registration requires gateway authentication and binds code to phone and expiry', async () => {
  await initializeBot();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/v1/pending`;
    const body = { startToken: 'test_start', code: '4321', phone: '+79990001234', expiresAt: new Date(Date.now() + 60000).toISOString() };
    const request = (authorized, value = body) => realFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(authorized ? { authorization: 'Bearer test-gateway-token' } : {}) },
      body: JSON.stringify(value),
    });
    assert.equal((await request(false)).status, 401);
    assert.equal((await request(true, { ...body, phone: '' })).status, 400);
    assert.equal((await request(true)).status, 202);
    assert.equal(pendingByStart.get('test_start').phone, body.phone);
    assert.equal(pendingByStart.get('test_start').expiresAt, Date.parse(body.expiresAt));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
