#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const https = require("https");

const baseUrl = trimRight(
  process.env.MSTYLE_API_BASE_URL || "https://pass.mstyle.ru/api",
  "/",
);
const tokenUrl = process.env.MSTYLE_TOKEN_URL || `${baseUrl}/oauth2/token`;
const keyDir =
  process.env.MSTYLE_KEYS_DIR || "/Users/tomilo/Downloads/production-4";
const backendClient = {
  clientId: process.env.MSTYLE_CLIENT_ID || "mstyle-backend-prod",
  kid: process.env.MSTYLE_CLIENT_KID || "mstyle-backend-prod-20260823-01",
};
backendClient.privateKeyPath = process.env.MSTYLE_CLIENT_PRIVATE_KEY_FILE || `${keyDir}/${backendClient.kid}-private.pem`;
backendClient.publicKeyPath = process.env.MSTYLE_CLIENT_PUBLIC_KEY_FILE || `${keyDir}/${backendClient.kid}-public.pem`;
const reconcileClient = {
  clientId: process.env.MSTYLE_RECONCILE_CLIENT_ID || "mstyle-reconcile-prod",
  kid: process.env.MSTYLE_RECONCILE_CLIENT_KID || "mstyle-reconcile-prod-20260823-01",
};
reconcileClient.privateKeyPath = process.env.MSTYLE_RECONCILE_CLIENT_PRIVATE_KEY_FILE || `${keyDir}/${reconcileClient.kid}-private.pem`;
reconcileClient.publicKeyPath = process.env.MSTYLE_RECONCILE_CLIENT_PUBLIC_KEY_FILE || `${keyDir}/${reconcileClient.kid}-public.pem`;
const schemaVersion = "2.0";
const apiPrefix = "/internal/integrations/mstyle/v2";
const stamp = Date.now().toString(36);

const state = {
  tokens: new Map(),
  profileId: "",
  subject: "",
  profileEtag: "",
  membershipsEtag: "",
  guestPartyId: "",
  guestEtag: "",
};

const steps = [
  {
    id: "T-01",
    title: "OAuth token, changes.read",
    scope: "mstyle.changes.read",
    client: reconcileClient,
    request: () => tokenFor("mstyle.changes.read", reconcileClient),
  },
  {
    id: "R-03",
    title: "Change feed",
    scope: "mstyle.changes.read",
    client: reconcileClient,
    method: "GET",
    path: "/changes?limit=5",
  },
  {
    id: "R-06",
    title: "Search profiles",
    scope: "mstyle.admin.search",
    method: "POST",
    path: "/resident-profiles/search",
    body: () => ({
      schemaVersion,
      query: { label: `smoke-${stamp}` },
      limit: 5,
    }),
  },
  {
    id: "R-08",
    title: "Onboard profile",
    scope: "mstyle.profiles.write",
    method: "POST",
    path: "/resident-onboarding",
    body: () => ({
      schemaVersion,
      profileType: "company",
      legalForm: "ooo",
      label: `smoke-${stamp}`,
      companyShortName: `smoke-${stamp}`,
      owner: {
        identifier: {
          type: "email",
          value: `smoke-owner-${stamp}@pass24.test`,
        },
        displayName: `Smoke Owner ${stamp}`,
      },
    }),
    after: ({ body, headers }) => {
      state.profileId = pick(body, "profileId");
      state.subject = pick(body, "subject");
      state.profileEtag = headers.etag || "";
    },
  },
  {
    id: "R-04",
    title: "Get profile",
    scope: "mstyle.profiles.read",
    method: "GET",
    path: () => `/resident-profiles/${state.profileId}`,
    after: ({ headers }) => {
      state.profileEtag = headers.etag || state.profileEtag;
    },
  },
  {
    id: "R-05",
    title: "Patch profile with If-Match",
    scope: "mstyle.profiles.write",
    method: "PATCH",
    path: () => `/resident-profiles/${state.profileId}`,
    headers: () => ({ "If-Match": state.profileEtag }),
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
    id: "M-01",
    title: "List memberships",
    scope: "mstyle.memberships.read",
    method: "GET",
    path: () => `/resident-profiles/${state.profileId}/memberships`,
    after: ({ headers }) => {
      state.membershipsEtag = headers.etag || "";
    },
  },
  {
    id: "G-01",
    title: "Create guest party",
    scope: "mstyle.guests.write",
    method: "POST",
    path: "/guest-parties",
    body: () => ({
      schemaVersion,
      purpose: `smoke-${stamp}`,
      role: "primary",
    }),
    after: ({ body }) => {
      state.guestPartyId = pick(body, "guestPartyId");
    },
  },
  {
    id: "G-04",
    title: "Guest status",
    scope: "mstyle.guests.read",
    method: "GET",
    path: () => `/guest-parties/${state.guestPartyId}/status`,
    after: ({ headers }) => {
      state.guestEtag = headers.etag || "";
    },
  },
  {
    id: "G-11",
    title: "Claim guest with If-Match",
    scope: "mstyle.guests.write",
    method: "POST",
    path: () => `/guest-parties/${state.guestPartyId}/claim`,
    headers: () => ({ "If-Match": state.guestEtag }),
    body: () => ({
      schemaVersion,
      subject: state.subject,
      claimedProfileId: state.profileId,
    }),
  },
];

function trimRight(value, char) {
  let out = String(value);
  while (out.endsWith(char)) out = out.slice(0, -1);
  return out;
}

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function makeAssertion(client) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: client.kid };
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
    "RSA-SHA256",
    Buffer.from(signingInput),
    fs.readFileSync(client.privateKeyPath),
  );
  return `${signingInput}.${b64url(signature)}`;
}

async function tokenFor(scope, client = backendClient) {
  const tokenKey = `${client.clientId}:${scope}`;
  if (state.tokens.has(tokenKey)) return state.tokens.get(tokenKey);
  const response = await postForm(tokenUrl, {
    grant_type: "client_credentials",
    client_id: client.clientId,
    client_assertion_type:
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
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
    "POST",
    url,
    {
      "content-type": "application/x-www-form-urlencoded",
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
          accept: "application/json",
          ...headers,
          ...(payload == null
            ? {}
            : { "content-length": Buffer.byteLength(payload) }),
        },
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk) => {
          responseBody += chunk;
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: responseBody,
          });
        });
      },
    );
    req.on("error", (error) =>
      resolve({ status: 0, headers: {}, body: String(error) }),
    );
    if (payload != null) req.write(payload);
    req.end();
  });
}

function parseJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return { raw: String(value).slice(0, 500) };
  }
}

function redact(body) {
  if (Array.isArray(body)) return body.map(redact);
  if (!body || typeof body !== "object") return body;
  return Object.fromEntries(Object.entries(body).map(([key, value]) => [
    key,
    /token|assertion|secret|password|code/i.test(key) ? "hidden" : redact(value),
  ]));
}

function pick(obj, key) {
  if (!obj || typeof obj !== "object") return "";
  if (typeof obj[key] === "string") return obj[key];
  for (const value of Object.values(obj)) {
    const found = pick(value, key);
    if (found) return found;
  }
  return "";
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
  const message = Buffer.from("pass24-mstyle-v2-smoke");
  const signature = crypto.sign("RSA-SHA256", message, privateKey);
  const matches = crypto.verify("RSA-SHA256", message, publicKey, signature);
  if (!matches) throw new Error("Private/public key pair does not match");
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
      note: "token received and hidden",
    };
  }
  const token = await tokenFor(step.scope, step.client || backendClient);
  const path = typeof step.path === "function" ? step.path() : step.path;
  const url = `${baseUrl}${apiPrefix}${path}`;
  const json = step.body ? JSON.stringify(step.body()) : undefined;
  const headers = {
    authorization: `Bearer ${token}`,
    "X-Request-ID": `req_${crypto.randomUUID()}`,
    ...(step.method === "GET"
      ? {}
      : { "Idempotency-Key": `idem_${crypto.randomUUID()}` }),
    ...(json ? { "content-type": "application/json" } : {}),
    ...(step.headers ? step.headers() : {}),
  };
  const response = await request(step.method, url, headers, json);
  const body = parseJson(response.body);
  const ok = response.status >= 200 && response.status < 300;
  if (ok && step.after) step.after({ body, headers: response.headers });
  return {
    id: step.id,
    title: step.title,
    method: step.method,
    url,
    scope: step.scope,
    status: response.status,
    ok,
    requestId: response.headers["x-request-id"],
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
        alg: "RS256",
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
