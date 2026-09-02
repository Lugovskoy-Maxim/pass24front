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
const CODE_TTL_MS = Number(process.env.PENDING_TTL_MS || 15 * 60 * 1000);

/** @type {Map<string, { code: string; text?: string; expiresAt: number }>} */
const pendingByStart = new Map();

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
  if (!GATEWAY_TOKEN) return true; // local/dev without token
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
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
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
}

async function sendCodeToChat(chatId, code, text) {
  const message =
    text ||
    `Код подтверждения: ${code}\nДействует ограниченное время. Никому не сообщайте код.`;
  return tg('sendMessage', {
    chat_id: chatId,
    text: message,
    disable_web_page_preview: true,
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
  pendingByStart.delete(token);
  await sendCodeToChat(chatId, pending.code, pending.text);
  log('delivered otp via /start', { chatId, token: token.slice(0, 8) });
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
    if (!msg?.text || !msg.chat?.id) continue;
    const text = String(msg.text);
    if (!text.startsWith('/start')) continue;
    const payload = text.replace(/^\/start(@\w+)?/, '').trim();
    try {
      await handleStart(msg.chat.id, payload);
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
      if (BOT_TOKEN && POLL) await pollOnce();
      else await new Promise((r) => setTimeout(r, 5000));
    } catch (err) {
      log('poll error', err.message || err);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
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

    if (req.method === 'POST' && url.pathname === '/v1/pending') {
      const body = await readJson(req);
      const startToken = String(body.startToken || '').trim();
      const code = String(body.code || '').trim();
      if (!/^\d{4,8}$/.test(code) || !startToken) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'startToken and 4-8 digit code required' }));
        return;
      }
      pendingByStart.set(startToken, {
        code,
        text: body.text ? String(body.text) : undefined,
        expiresAt: Date.now() + CODE_TTL_MS,
      });
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, expiresInSec: Math.floor(CODE_TTL_MS / 1000) }));
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

server.listen(PORT, '0.0.0.0', () => {
  log(`telegram-gateway listening on :${PORT}`);
  void pollLoop();
});
