#!/usr/bin/env node

const fs = require('fs');
const crypto = require('crypto');
const https = require('https');

const tokenUrl =
  process.env.MSTYLE_TOKEN_URL || 'https://pass.mstyle.ru/api/oauth2/token';
const keyDir =
  process.env.MSTYLE_KEYS_DIR || '/Users/tomilo/Downloads/production-4';

const clients = [
  {
    name: 'backend',
    clientId: process.env.MSTYLE_CLIENT_ID || 'mstyle-backend-prod',
    kid: process.env.MSTYLE_CLIENT_KID || 'mstyle-backend-prod-20260823-01',
    scope:
      process.env.MSTYLE_CLIENT_SCOPES ||
      'mstyle.resident.authenticate mstyle.residents.read',
    privateKeyPath:
      process.env.MSTYLE_CLIENT_PRIVATE_KEY_FILE ||
      `${keyDir}/mstyle-backend-prod-20260823-01-private.pem`,
    publicKeyPath:
      process.env.MSTYLE_CLIENT_PUBLIC_KEY_FILE ||
      `${keyDir}/mstyle-backend-prod-20260823-01-public.pem`,
  },
  {
    name: 'reconcile',
    clientId:
      process.env.MSTYLE_RECONCILE_CLIENT_ID || 'mstyle-reconcile-prod',
    kid:
      process.env.MSTYLE_RECONCILE_CLIENT_KID ||
      'mstyle-reconcile-prod-20260823-01',
    scope: process.env.MSTYLE_RECONCILE_CLIENT_SCOPES || 'mstyle.changes.read',
    privateKeyPath:
      process.env.MSTYLE_RECONCILE_CLIENT_PRIVATE_KEY_FILE ||
      `${keyDir}/mstyle-reconcile-prod-20260823-01-private.pem`,
    publicKeyPath:
      process.env.MSTYLE_RECONCILE_CLIENT_PUBLIC_KEY_FILE ||
      `${keyDir}/mstyle-reconcile-prod-20260823-01-public.pem`,
  },
];

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

function assertFile(path) {
  if (!fs.existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }
}

function verifyKeyPair(client) {
  assertFile(client.privateKeyPath);
  assertFile(client.publicKeyPath);

  const privateKey = fs.readFileSync(client.privateKeyPath);
  const publicKey = fs.readFileSync(client.publicKeyPath);
  const message = Buffer.from(`pass24-${client.name}-oauth-check`);
  const signature = crypto.sign('RSA-SHA256', message, privateKey);
  const matches = crypto.verify('RSA-SHA256', message, publicKey, signature);

  return {
    matches,
    publicPemSha256: sha256Hex(publicKey),
  };
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

function postForm(url, body) {
  return new Promise((resolve) => {
    const data = new URLSearchParams(body).toString();
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: responseBody,
          });
        });
      },
    );

    req.on('error', (error) => resolve({ error: String(error) }));
    req.write(data);
    req.end();
  });
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return { raw: String(value).slice(0, 300) };
  }
}

async function checkClient(client) {
  const keyCheck = verifyKeyPair(client);
  const response = await postForm(tokenUrl, {
    grant_type: 'client_credentials',
    client_id: client.clientId,
    client_assertion_type:
      'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: makeAssertion(client),
    scope: client.scope,
  });

  const parsed = safeJson(response.body || '');

  return {
    name: client.name,
    tokenUrl,
    method: 'POST',
    clientId: client.clientId,
    kid: client.kid,
    alg: 'RS256',
    scope: client.scope,
    privateKeyFile: client.privateKeyPath,
    publicKeyFile: client.publicKeyPath,
    publicPemSha256: keyCheck.publicPemSha256,
    keyPairMatches: keyCheck.matches,
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    hasAccessToken: Boolean(parsed.access_token),
    tokenType: parsed.token_type,
    expiresIn: parsed.expires_in,
    responseScope: parsed.scope,
    error: parsed.error,
    errorDescription: parsed.error_description,
    raw: parsed.raw,
  };
}

async function main() {
  console.log(`Token URL: ${tokenUrl}`);
  console.log(`Keys dir: ${keyDir}`);
  console.log('Access tokens are intentionally not printed.\n');

  let failed = false;
  for (const client of clients) {
    try {
      const result = await checkClient(client);
      if (!result.ok || !result.hasAccessToken || !result.keyPairMatches) {
        failed = true;
      }
      console.log(JSON.stringify(result, null, 2));
      console.log('');
    } catch (error) {
      failed = true;
      console.error(
        JSON.stringify(
          {
            name: client.name,
            clientId: client.clientId,
            kid: client.kid,
            error: error.message,
          },
          null,
          2,
        ),
      );
      console.error('');
    }
  }

  process.exitCode = failed ? 1 : 0;
}

main();
