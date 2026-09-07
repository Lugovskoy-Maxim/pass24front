'use strict';

/**
 * Minimal Telegram Bot gateway for Pass OTP.
 * Intended to run with network_mode: service:wireguard so Bot API
 * calls egress via WireGuard VPN, while backend reaches this HTTP API
 * on the wireguard container hostname (shared netns).
 *
 * Auth: Authorization: Bearer <GATEWAY_TOKEN>
 */

const http = require('http');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 8091);
const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const GATEWAY_TOKEN = (process.env.TELEGRAM_GATEWAY_TOKEN || '').trim();
const POLL = String(process.env.TELEGRAM_POLL || 'true').toLowerCase() !== 'false';
const CODE_TTL_MS = 5 * 60 * 1000;
const EXPECTED_BOT = (process.env.MSTYLE_TELEGRAM_BOT || 'm_style_office_bot').trim().replace(/^@/, '');
let ready = false;

/** @type {Map<string, { code: string; phone: string; text?: string; expiresAt: number }>} */
const pendingByStart = new Map();
const startByChat = new Map();

function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  return /^\d{10,15}$/.test(digits) ? `+${digits}` : '';
}

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function unauthorized(res) {
  res.writeHead(401, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'unauthorized' }));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function authOk(req) {
  if (!GATEWAY_TOKEN) return false;
  const header = req.headers.authorization || '';
  return header === `Bearer ${GATEWAY_TOKEN}`;
}

async function tg(method, body) {
  if (!BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set');
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(method === 'getUpdates' ? 35_000 : 10_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok !== true) {
    const desc = data.description || res.statusText || 'telegram error';
    const err = new Error(desc);
    err.telegram = data;
    throw err;
  }
  return data.result;
}

function prunePending() {
  const now = Date.now();
  for (const [key, value] of pendingByStart) {
    if (value.expiresAt <= now) pendingByStart.delete(key);
  }
  for (const [chatId, token] of startByChat) {
    if (!pendingByStart.has(token)) startByChat.delete(chatId);
  }
}

async function sendCodeToChat(chatId, code, text) {
  const message =
    text ||
    `Код подтверждения: ${code}\nДействует ограниченное время. Никому не сообщайте код.`;
  return tg('sendMessage', {
    chat_id: chatId,
    text: message,
    disable_web_page_preview: true,
    protect_content: true,
    reply_markup: { remove_keyboard: true },
  });
}

async function handleStart(chatId, startPayload) {
  prunePending();
  const token = (startPayload || '').trim();
  if (!token) {
    await tg('sendMessage', {
      chat_id: chatId,
      text: 'Откройте ссылку входа из приложения Pass / M-Style, чтобы получить код.',
    });
    return;
  }
  const pending = pendingByStart.get(token);
  if (!pending) {
    await tg('sendMessage', {
      chat_id: chatId,
      text: 'Код не найден или уже истёк. Запросите новый код в приложении.',
    });
    return;
  }
  startByChat.set(chatId, token);
  await tg('sendMessage', {
    chat_id: chatId,
    text: 'Подтвердите номер телефона для входа в М-Стиль Офис.',
    reply_markup: {
      keyboard: [[{ text: 'Подтвердить мой номер', request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
}

async function handleMessage(msg) {
  if (msg?.chat?.type !== 'private' || !msg.from || msg.from.is_bot) return;
  const chatId = msg.chat.id;
  const start = String(msg.text || '').match(/^\/start(?:@(\w+))?(?:\s+([A-Za-z0-9_-]{1,64}))?\s*$/);
  if (start && (!start[1] || start[1].toLowerCase() === EXPECTED_BOT.toLowerCase())) {
    return handleStart(chatId, start[2]);
  }
  if (!msg.contact) return;
  prunePending();
  const token = startByChat.get(chatId);
  const pending = pendingByStart.get(token);
  if (!pending) return handleStart(chatId, 'expired');
  if (msg.contact.user_id !== msg.from.id || normalizePhone(msg.contact.phone_number) !== pending.phone) {
    await tg('sendMessage', {
      chat_id: chatId,
      text: 'Номер не совпадает с номером входа. Используйте свой контакт и проверьте номер в приложении.',
    });
    return;
  }
  await sendCodeToChat(chatId, pending.code, pending.text);
  // A resend may replace the entry while Telegram is accepting this message.
  if (pendingByStart.get(token) === pending) pendingByStart.delete(token);
  startByChat.delete(chatId);
  log('OTP delivered');
}

async function initializeBot() {
  ready = false;
  if (!BOT_TOKEN || !GATEWAY_TOKEN || !POLL) {
    throw new Error('TELEGRAM_BOT_TOKEN, TELEGRAM_GATEWAY_TOKEN and TELEGRAM_POLL=true are required');
  }
  const bot = await tg('getMe');
  if (bot?.username?.toLowerCase() !== EXPECTED_BOT.toLowerCase()) {
    throw new Error(`Bot token username does not match MSTYLE_TELEGRAM_BOT=${EXPECTED_BOT}`);
  }
  const webhook = await tg('getWebhookInfo');
  if (webhook?.url) throw new Error('Webhook is active: remove it before using this polling gateway');
  ready = true;
  log('Telegram bot ready', { username: bot.username });
}

let offset = 0;
let polling = false;

async function pollOnce() {
  if (!BOT_TOKEN || !POLL) return;
  const updates = await tg('getUpdates', {
    offset,
    timeout: 25,
    allowed_updates: ['message'],
  });
  for (const update of updates || []) {
    offset = update.update_id + 1;
    const msg = update.message;
    try {
      await handleMessage(msg);
    } catch (err) {
      log('start handler error', err.message || err);
    }
  }
}

async function pollLoop() {
  if (polling) return;
  polling = true;
  log('telegram poll loop started', { enabled: Boolean(BOT_TOKEN) && POLL });
  while (true) {
    try {
      if (!ready) await initializeBot();
      await pollOnce();
    } catch (err) {
      ready = false;
      log('poll error', err.message || err);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      prunePending();
      res.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: ready,
          botUsername: EXPECTED_BOT,
          botConfigured: Boolean(BOT_TOKEN),
          pending: pendingByStart.size,
        }),
      );
      return;
    }

    if (!authOk(req)) {
      unauthorized(res);
      return;
    }

    if (!ready) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'telegram bot is not ready; check gateway logs' }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/pending') {
      const body = await readJson(req);
      const startToken = String(body.startToken || '').trim();
      const code = String(body.code || '').trim();
      const phone = normalizePhone(body.phone);
      const expiresAt = Math.min(Date.parse(body.expiresAt), Date.now() + CODE_TTL_MS);
      if (!/^\d{4,8}$/.test(code) || !/^[A-Za-z0-9_-]{1,64}$/.test(startToken) || !phone || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'valid startToken, code, phone and future expiresAt required' }));
        return;
      }
      prunePending();
      pendingByStart.set(startToken, {
        code,
        phone,
        text: body.text ? String(body.text) : undefined,
        expiresAt,
      });
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, expiresInSec: Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)) }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/send') {
      const body = await readJson(req);
      const chatId = body.chatId;
      const code = body.code != null ? String(body.code) : '';
      const text = body.text != null ? String(body.text) : undefined;
      if (chatId == null) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'chatId required' }));
        return;
      }
      if (code && !/^\d{4,8}$/.test(code)) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'code must be 4-8 digits' }));
        return;
      }
      const result = code
        ? await sendCodeToChat(chatId, code, text)
        : await tg('sendMessage', {
            chat_id: chatId,
            text: text || '',
            disable_web_page_preview: true,
          });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  } catch (err) {
    log('request error', err.message || err);
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: err.message || 'gateway error' }));
  }
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    log(`telegram-gateway listening on :${PORT}`);
    void pollLoop();
  });
}

module.exports = { server, initializeBot, handleMessage, pendingByStart, startByChat };
