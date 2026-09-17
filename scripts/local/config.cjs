"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "../..");
const stateDir = path.join(root, ".local");
const ports = Object.freeze({
  frontend: 3300,
  backend: 3400,
  control: 3410,
  mongo: 37017,
});
const urls = Object.freeze({
  frontend: "http://127.0.0.1:3300",
  backend: "http://127.0.0.1:3400",
});
const settingsFile = path.join(stateDir, "settings.json");

function settings(create = false) {
  if (fs.existsSync(settingsFile))
    return JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  if (!create) return null;
  fs.mkdirSync(path.join(stateDir, "keys"), { recursive: true });
  const keyPair = crypto.generateKeyPairSync("rsa", {
    modulusLength: 3072,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  fs.writeFileSync(
    path.join(stateDir, "keys/client-private.pem"),
    keyPair.privateKey,
    { mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(stateDir, "keys/client-public.pem"),
    keyPair.publicKey,
  );
  const value = {
    version: 1,
    adminUsername: "local-admin",
    adminPassword: crypto.randomBytes(18).toString("base64url"),
    jwtSecret: crypto.randomBytes(48).toString("base64url"),
    controlToken: crypto.randomBytes(32).toString("base64url"),
  };
  fs.writeFileSync(settingsFile, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  return value;
}

// Keep only OS paths. Provider credentials, proxies, NODE_OPTIONS and application
// settings from the launching shell must not enter the local application.
function cleanEnvironment() {
  const allowed = new Set([
    "systemroot",
    "windir",
    "comspec",
    "pathext",
    "temp",
    "tmp",
    "path",
    "userprofile",
    "appdata",
    "localappdata",
    "programfiles",
    "programfiles(x86)",
    "commonprogramfiles",
    "systemdrive",
    "number_of_processors",
  ]);
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      allowed.has(key.toLowerCase()),
    ),
  );
}

function environment(component, localSettings) {
  return {
    ...cleanEnvironment(),
    NODE_ENV: component === "frontend" ? "production" : "development",
    PASS_LOCAL_ISOLATED: "1",
    NEXT_PUBLIC_LOCAL_ISOLATED: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_API_URL: urls.backend + "/api",
    NEXT_PUBLIC_APP_VERSION: "local",
    PORT: String(ports[component] || ports.backend),
    HOST: "127.0.0.1",
    HOSTNAME: "127.0.0.1",
    MONGODB_URI: `mongodb://127.0.0.1:${ports.mongo}/pass_local`,
    MONGODB_AUTH_URI: `mongodb://127.0.0.1:${ports.mongo}/pass_local_auth`,
    JWT_SECRET: localSettings.jwtSecret,
    JWT_EXPIRES_IN: "7d",
    ADMIN_USERNAME: localSettings.adminUsername,
    ADMIN_PASSWORD: localSettings.adminPassword,
    ADMIN_FULL_NAME: "Локальный администратор",
    ADMIN_ROLE: "admin",
    ADMIN_EMAIL: "local-admin@pass24.local",
    SEED_DEV_DATA: "false",
    PUBLIC_APP_URL: urls.frontend,
    PUBLIC_API_URL: urls.backend,
    SMTP_HOST: "",
    SMS_ENABLED: "false",
    MSTYLE_SMS_ENABLED: "false",
    TELEGRAM_GATEWAY_URL: "",
    MSTYLE_PRIVATE_API_ENABLED: "true",
    MSTYLE_MOCK_RESPONSES: "false",
    MSTYLE_DISPATCH_ENABLED: "false",
    MSTYLE_MOCK_OTP: "1234",
    MSTYLE_ENVIRONMENT: "local",
    MSTYLE_CONSENT_DOCUMENTS_JSON: JSON.stringify([
      {
        documentCode: "personal_data_processing",
        documentVersion: "local-v1",
        documentDigest:
          "sha256:" +
          crypto
            .createHash("sha256")
            .update("Isolated local consent fixture. No legal effect.")
            .digest("hex"),
        documentUrl: "https://local.invalid/local-consent-fixture",
        locale: "ru-RU",
        evidenceCodes: ["booking_checkbox", "account_checkbox"],
      },
    ]),
    MSTYLE_PUBLIC_BASE_URL: urls.backend,
    MSTYLE_CLIENT_ID: "mstyle-backend-local",
    MSTYLE_CLIENT_AUTH: "private_key_jwt",
    MSTYLE_CLIENT_KID: "local-rsa-1",
    MSTYLE_CLIENT_PUBLIC_KEY_FILE: path.join(
      stateDir,
      "keys/client-public.pem",
    ),
    MSTYLE_RECONCILE_CLIENT_ID: "mstyle-reconcile-local",
    MSTYLE_RECONCILE_CLIENT_AUTH: "private_key_jwt",
    MSTYLE_RECONCILE_CLIENT_KID: "local-rsa-1",
    MSTYLE_RECONCILE_CLIENT_PUBLIC_KEY_FILE: path.join(
      stateDir,
      "keys/client-public.pem",
    ),
  };
}

function assertNoEnvironmentFiles() {
  for (const directory of [
    root,
    path.join(root, "backend"),
    path.join(root, "frontend"),
  ]) {
    for (const name of fs.readdirSync(directory)) {
      if (
        (name === ".env" || name.startsWith(".env.")) &&
        !name.endsWith(".example")
      ) {
        throw new Error(
          `Remove the runtime environment file from the local copy: ${path.join(directory, name)}`,
        );
      }
    }
  }
}

module.exports = {
  root,
  stateDir,
  ports,
  urls,
  settings,
  settingsFile,
  environment,
  cleanEnvironment,
  assertNoEnvironmentFiles,
};
