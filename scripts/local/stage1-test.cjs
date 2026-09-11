"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { root, stateDir, ports, urls, settings } = require("./config.cjs");
const { MongoClient } = require(
  path.join(root, "backend/node_modules/mongodb"),
);
const { Ids } = require(
  path.join(root, "backend/dist/integrations/mstyle-v2/mstyle-v2.ids"),
);
const { encryptJson, hmacHex, maskContact } = require(
  path.join(root, "backend/dist/integrations/mstyle-v2/mstyle-v2.crypto"),
);
const cfg = settings();
const prefix = "/api/internal/integrations/mstyle/v2";
const api = urls.backend + prefix;
const clientId = "mstyle-backend-local";
const privateKey = fs.readFileSync(
  path.join(stateDir, "keys/client-private.pem"),
);
const mongo = new MongoClient(
  "mongodb://127.0.0.1:" + ports.mongo + "/pass_local",
  { serverSelectionTimeoutMS: 2000 },
);
const history = [];
const checks = [];
const tokens = new Map();
const uid = () => crypto.randomUUID();
const nonce = () => crypto.randomBytes(24).toString("base64url");
const schema = (body) => ({ schemaVersion: "2.0", ...body });
const context = {
  ipAddress: "127.0.0.1",
  userAgent: "Pass stage 1 local acceptance",
  locale: "ru-RU",
};
const company = {
  fullName: 'ООО "Локальный тест"',
  inn: "0000000000",
  ogrn: "0000000000000",
  legalAddress: "Тестовый адрес 1",
};
let db;
function signed(typ, claims) {
  const data = [{ alg: "RS256", typ, kid: "local-rsa-1" }, claims]
    .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
    .join(".");
  return (
    data +
    "." +
    crypto.sign("sha256", Buffer.from(data), privateKey).toString("base64url")
  );
}
async function token(scope) {
  if (tokens.has(scope)) return tokens.get(scope);
  const oauthClientId =
    scope === "mstyle.integration.reconcile"
      ? "mstyle-reconcile-local"
      : clientId;
  const now = Math.floor(Date.now() / 1000);
  const assertion = signed("JWT", {
    iss: oauthClientId,
    sub: oauthClientId,
    aud: urls.backend + "/api/oauth2/token",
    iat: now,
    exp: now + 55,
    jti: nonce(),
  });
  const response = await fetch(urls.backend + "/api/oauth2/token", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: oauthClientId,
      scope,
      client_assertion_type:
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: assertion,
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.scope, scope);
  tokens.set(scope, body.access_token);
  return body.access_token;
}
function adminAssertion(method, route, scope, headers, patch = {}) {
  const now = Math.floor(Date.now() / 1000);
  return signed("mstyle-admin-step-up+jwt", {
    iss: clientId,
    sub: headers["X-Actor-Ref"],
    aud: api,
    iat: now,
    exp: now + 55,
    jti: nonce(),
    auth_context: "wp_session",
    scope,
    purpose: headers["X-Purpose-Code"] || "",
    method,
    target: prefix + route,
    requestId: headers["X-Request-ID"],
    ...patch,
  });
}
async function request(method, route, scope, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + (options.guestToken || (await token(scope))),
    "X-Request-ID": uid(),
    ...options.headers,
  };
  if (method !== "GET" && !headers["Idempotency-Key"])
    headers["Idempotency-Key"] = uid();
  if (options.auth)
    Object.assign(headers, {
      "X-Actor-Ref": "resident:" + options.auth.subject,
      "X-Resident-Subject": options.auth.subject,
      "X-Step-Up-Authentication-ID": options.auth.authenticationId,
    });
  if (options.purpose) headers["X-Purpose-Code"] = options.purpose;
  if (options.admin) {
    headers["X-Actor-Ref"] = options.actor || "wp-admin:7";
    if (options.assertion !== null)
      headers["X-Admin-Step-Up-Assertion"] =
        options.assertion ||
        adminAssertion(method, route, scope, headers, options.claims);
  }
  const response = await fetch(api + route, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json();
  const item = {
    method,
    route,
    status: response.status,
    requestId: headers["X-Request-ID"],
    actor: headers["X-Actor-Ref"],
    ifMatch: headers["If-Match"],
    idempotencyKey: headers["Idempotency-Key"],
    request: options.body?.password
      ? { ...options.body, password: "[local test credential omitted]" }
      : options.body,
    response: body,
  };
  history.push(item);
  assert.ok(
    (Array.isArray(options.status)
      ? options.status
      : [options.status ?? 200]
    ).includes(response.status),
    JSON.stringify(item),
  );
  return {
    body,
    status: response.status,
    headers: response.headers,
    sentHeaders: headers,
  };
}
function pass(name) {
  checks.push(name);
  console.log("PASS: " + name);
}
async function fixture(label, policy) {
  const subject = Ids.subject(),
    profileId = Ids.profile(),
    email = subject.toLowerCase() + "@pass24.local";
  const createdAt = new Date();
  await db.collection("mstyle_v2_identities").insertOne({
    subject,
    email,
    displayName: label,
    name: {},
    identityStatus: "active",
    authVersion: 1,
    revision: 1,
    contextRevision: 1,
    isDummy: false,
    createdAt,
    updatedAt: createdAt,
  });
  await db.collection("mstyle_v2_profiles").insertOne({
    profileId,
    type: "company",
    legalForm: "ooo",
    status: "active",
    label,
    companyShortName: label,
    revision: 1,
    membershipSetRevision: 1,
    assignmentSetRevision: 1,
    memberPolicy: { employeeLimit: 5 },
    privateDataRevision: policy ? 1 : null,
    privateDataComplete: !!policy,
    sourceLinks: [],
    createdAt,
    updatedAt: createdAt,
  });
  await db.collection("mstyle_v2_memberships").insertOne({
    membershipId: Ids.membership(),
    subject,
    profileId,
    role: "owner",
    status: "active",
    validFrom: createdAt.toISOString(),
    validUntil: null,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
  });
  await db.collection("mstyle_v2_contacts").insertOne({
    contactId: Ids.contact(),
    subject,
    type: "email",
    masked: maskContact("email", email),
    valueEnc: encryptJson(cfg.jwtSecret, email),
    valueHash: hmacHex(cfg.jwtSecret, "email:" + email),
    verifiedAt: createdAt.toISOString(),
    revision: 1,
    createdAt,
    updatedAt: createdAt,
  });
  if (policy)
    await db.collection("mstyle_v2_private_data").insertOne({
      partyType: "resident_profile",
      partyId: profileId,
      profileType: "company",
      legalForm: "ooo",
      revision: 1,
      editPolicy: policy,
      valuesEnc: encryptJson(cfg.jwtSecret, { company }),
      createdAt,
      updatedAt: createdAt,
    });
  return { subject, profileId, email };
}
async function login(email) {
  const challenge = await request(
    "POST",
    "/auth/residents/code-challenges",
    "mstyle.resident.authenticate",
    {
      status: 202,
      body: schema({
        identifier: { type: "email", value: email },
        channel: "email",
        context,
      }),
    },
  );
  return (
    await request(
      "POST",
      "/auth/residents/code-challenges/" +
        challenge.body.challengeId +
        "/verify",
      "mstyle.resident.authenticate",
      { body: schema({ code: "1234", context }) },
    )
  ).body;
}
async function profile(f, auth) {
  return request(
    "GET",
    "/resident-profiles/" + f.profileId,
    "mstyle.resident.profile.read",
    { auth },
  );
}
async function members(f, auth) {
  return request(
    "GET",
    "/resident-profiles/" + f.profileId + "/memberships",
    "mstyle.resident.members.read",
    { auth },
  );
}
async function assignments(f, auth) {
  return request(
    "GET",
    "/resident-profiles/" + f.profileId + "/contact-assignments",
    "mstyle.resident.contact.read",
    { auth },
  );
}
async function privateStatus(f, auth) {
  return request(
    "GET",
    "/resident-profiles/" + f.profileId + "/private-data/status",
    "mstyle.resident.private.status.read",
    { auth },
  );
}
async function privateRead(f, auth) {
  return request(
    "POST",
    "/resident-profiles/" + f.profileId + "/private-data/reveal",
    "mstyle.resident.private.reveal",
    {
      auth,
      purpose: "account_profile_view",
      body: schema({
        fieldCodes: [
          "company.fullName",
          "company.inn",
          "company.ogrn",
          "company.legalAddress",
        ],
      }),
    },
  );
}
async function privatePatch(f, auth, data, etag, status = 200, key = uid()) {
  return request(
    "PATCH",
    "/resident-profiles/" + f.profileId + "/private-data",
    "mstyle.resident.private.write",
    {
      auth,
      purpose: "account_profile_edit",
      status,
      headers: { "If-Match": etag, "Idempotency-Key": key },
      body: schema({
        privateData: { profileType: "company", legalForm: "ooo", data },
      }),
    },
  );
}
async function rawDuplicate(name) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      api + "/identities/usr_1",
      {
        method: "GET",
        headers: [
          "Host",
          "127.0.0.1:3400",
          "Authorization",
          "Bearer placeholder",
          "X-Request-ID",
          "req_one",
          name,
          "one",
          name,
          "two",
        ],
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            body: raw ? JSON.parse(raw) : null,
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}
async function main(
  expected = {
    backend: "http://127.0.0.1:3400",
    mongo: 37017,
    replicaSet: "pass-local-rs",
  },
) {
  assert.equal(urls.backend, expected.backend);
  assert.equal(ports.mongo, expected.mongo);
  await mongo.connect();
  db = mongo.db();
  const hello = await mongo.db("admin").command({ hello: 1 });
  assert.equal(hello.setName, expected.replicaSet);
  const f = await fixture("Локальный этап 1");
  const r = await fixture("ООО с заявками", "request_only");
  const spare = await fixture("Профиль для следующего этапа");
  const owner = await login(f.email),
    requester = await login(r.email);
  const fixtures = { primary: f, requestOnly: r, futureOwnerTransfer: spare };
  fs.writeFileSync(
    path.join(stateDir, "stage1-fixtures.json"),
    JSON.stringify(fixtures, null, 2),
  );
  let m = await members(f, owner),
    c = await assignments(f, owner),
    p = await profile(f, owner);
  assert.equal(p.body.membershipSetRevision, m.body.membershipSetRevision);
  assert.equal(
    p.body.contactAssignmentSetRevision,
    c.body.assignmentSetRevision,
  );
  pass("R-04 versions match M-01 and C-03");

  const employeeEmail = Ids.subject().toLowerCase() + "@pass24.local";
  const invitation = schema({
    expectedRevisions: {
      profile: p.body.revision,
      membershipSet: m.body.membershipSetRevision,
    },
    identity: {
      existingSubject: null,
      invitation: { displayName: "Вадим 2", email: employeeEmail, phone: null },
    },
  });
  const inviteRoute = "/resident-profiles/" + f.profileId + "/memberships";
  const inviteOptions = {
    auth: owner,
    purpose: "membership_invitation",
    body: invitation,
    status: 201,
    headers: { "If-Match": m.headers.get("etag"), "Idempotency-Key": uid() },
  };
  const added = await request(
    "POST",
    inviteRoute,
    "mstyle.resident.members.write",
    inviteOptions,
  );
  assert.equal(added.body.invitationStatus, "pending");
  assert.equal(added.body.membership.role, "employee");
  assert.equal(added.body.membership.status, "invited");
  assert.ok(
    added.body.contextRevisions.some((row) => row.subject === owner.subject),
  );
  assert.deepEqual(
    (
      await request(
        "POST",
        inviteRoute,
        "mstyle.resident.members.write",
        inviteOptions,
      )
    ).body,
    added.body,
  );
  await request("POST", inviteRoute, "mstyle.resident.members.write", {
    ...inviteOptions,
    status: 412,
    headers: { ...inviteOptions.headers, "Idempotency-Key": uid() },
  });
  const employee = await login(employeeEmail);
  assert.equal(employee.subject, added.body.membership.subject);
  m = await members(f, owner);
  assert.equal(
    m.body.items.find((row) => row.membership.subject === employee.subject)
      .membership.status,
    "active",
  );
  for (const status of ["suspended", "active"]) {
    const result = await request(
      "PATCH",
      "/resident-memberships/" + added.body.membership.id,
      "mstyle.resident.members.write",
      {
        auth: owner,
        headers: { "If-Match": m.headers.get("etag") },
        body: schema({ status, reasonCode: "local_stage1" }),
      },
    );
    assert.equal(result.body.membership.status, status);
    m = await members(f, owner);
  }
  await request(
    "POST",
    "/resident-memberships/" + added.body.membership.id + "/revoke",
    "mstyle.resident.members.write",
    {
      auth: owner,
      headers: { "If-Match": m.headers.get("etag") },
      body: schema({ reasonCode: "local_stage1" }),
    },
  );
  assert.equal(
    await db
      .collection("mstyle_v2_identities")
      .countDocuments({ email: employeeEmail }),
    1,
  );
  assert.equal(
    await db
      .collection("mstyle_v2_memberships")
      .countDocuments({ subject: employee.subject, profileId: f.profileId }),
    1,
  );
  fixtures.employee = {
    subject: employee.subject,
    email: employeeEmail,
    membershipId: added.body.membership.id,
  };
  m = await members(f, owner);
  const freshInvitation = {
    ...invitation,
    expectedRevisions: {
      profile: 1,
      membershipSet: m.body.membershipSetRevision,
    },
  };
  const currentHeaders = { "If-Match": m.headers.get("etag") };
  for (const identity of [
    {},
    {
      existingSubject: employee.subject,
      invitation: invitation.identity.invitation,
    },
    { invitation: { displayName: "Вадим 2", email: employeeEmail, phone: "" } },
  ]) {
    await request("POST", inviteRoute, "mstyle.resident.members.write", {
      auth: owner,
      purpose: "membership_invitation",
      status: 422,
      headers: currentHeaders,
      body: { ...freshInvitation, identity },
    });
  }
  assert.equal(
    (await members(f, owner)).body.membershipSetRevision,
    m.body.membershipSetRevision,
  );
  await request("POST", inviteRoute, "mstyle.resident.members.write", {
    auth: requester,
    purpose: "membership_invitation",
    status: 404,
    headers: currentHeaders,
    body: freshInvitation,
  });
  const existingAdded = await request(
    "POST",
    inviteRoute,
    "mstyle.resident.members.write",
    {
      auth: owner,
      purpose: "membership_invitation",
      status: 201,
      headers: currentHeaders,
      body: {
        ...freshInvitation,
        identity: { existingSubject: employee.subject, invitation: null },
      },
    },
  );
  assert.equal(existingAdded.body.invitationStatus, "existing_identity");
  assert.equal(existingAdded.body.membership.status, "active");
  pass(
    "M-02 email without phone, both identity branches, validation/ownership, retry/stale revision, login and M-03/M-04 lifecycle",
  );

  // A legacy stored ID must work through the same public C-05/C-04/C-03 chain.
  const existingContact = await db
    .collection("mstyle_v2_contacts")
    .findOne({ subject: owner.subject, type: "email" });
  await db.collection("mstyle_v2_contacts").updateOne(
    { _id: existingContact._id },
    {
      $set: { contactId: existingContact.contactId.replace(/^ict_/, "cnt_") },
    },
  );
  const revealed = await request(
    "POST",
    "/residents/" + owner.subject + "/contacts/reveal",
    "mstyle.resident.contact.read",
    {
      auth: owner,
      purpose: "account_contact_view",
      body: schema({ fieldCodes: ["email"] }),
    },
  );
  assert.equal(revealed.body.contacts.length, 1);
  assert.match(revealed.body.contacts[0].contactId, /^ict_/);
  const newAssignment = {
    purpose: "primary",
    subject: owner.subject,
    contactId: revealed.body.contacts[0].contactId,
    priority: 1,
    status: "active",
  };
  let replaced = await request(
    "PATCH",
    "/resident-profiles/" + f.profileId + "/contact-assignments",
    "mstyle.resident.contact.write",
    {
      auth: owner,
      purpose: "account_profile_edit",
      headers: { "If-Match": c.headers.get("etag") },
      body: schema({ assignments: [newAssignment] }),
    },
  );
  c = await assignments(f, owner);
  assert.equal(c.body.items[0].contactId, newAssignment.contactId);
  assert.equal(
    c.body.assignmentSetRevision,
    replaced.body.assignmentSetRevision,
  );
  const before = JSON.stringify(c.body);
  await request(
    "PATCH",
    "/resident-profiles/" + f.profileId + "/contact-assignments",
    "mstyle.resident.contact.write",
    {
      auth: owner,
      purpose: "account_profile_edit",
      status: 422,
      headers: { "If-Match": c.headers.get("etag") },
      body: schema({
        assignments: [
          newAssignment,
          { ...newAssignment, purpose: "billing", contactId: "ict_missing" },
        ],
      }),
    },
  );
  assert.equal(JSON.stringify((await assignments(f, owner)).body), before);
  const liveContacts = await request(
    "POST",
    "/resident-profiles/" + f.profileId + "/contacts/reveal",
    "mstyle.resident.contact.read",
    {
      auth: owner,
      purpose: "account_profile_view",
      body: schema({
        contactPurpose: "primary",
        fieldCodes: ["email", "displayName"],
      }),
    },
  );
  assert.equal(liveContacts.body.values.email, f.email);
  assert.equal(liveContacts.headers.get("cache-control"), "no-store, private");
  pass(
    "C-05 ict_ IDs including legacy storage, C-04 atomic replacement, C-03 and P-05",
  );

  let st = await privateStatus(f, owner);
  assert.equal(st.body.exists, false);
  assert.equal(st.body.editPolicy, "initial");
  const invalidCases = [
    [
      { fullName: "   ", inn: "0000000000", ogrn: "0000000000000" },
      "company.fullName",
      "Укажите полное название ООО",
    ],
    [
      { ...company, inn: 1234567890 },
      "company.inn",
      "Значение должно быть строкой",
    ],
    [
      { ...company, ogrn: "123" },
      "company.ogrn",
      "ОГРН ООО должен содержать ровно 13 цифр",
    ],
    [
      { ...company, inn: "００００００００００" },
      "company.inn",
      "ИНН ООО должен содержать ровно 10 цифр",
    ],
    [
      { inn: "0000000000", ogrn: "0000000000000" },
      "company.fullName",
      "Укажите полное название ООО",
    ],
  ];
  for (const [data, field, message] of invalidCases) {
    const bad = await privatePatch(f, owner, data, st.headers.get("etag"), 422);
    assert.ok(
      bad.body.errors.some(
        (error) => error.field === field && error.message === message,
      ),
      JSON.stringify(bad.body),
    );
    assert.equal((await privateStatus(f, owner)).body.exists, false);
  }
  let saved = await privatePatch(
    f,
    owner,
    { ...company, fullName: "  " + company.fullName + "  " },
    st.headers.get("etag"),
  );
  assert.equal(saved.body.status.complete, true);
  assert.equal(
    (await privateRead(f, owner)).body.values.company.fullName,
    company.fullName,
  );
  await privatePatch(
    f,
    owner,
    { legalAddress: "Неверная версия" },
    st.headers.get("etag"),
    412,
  );
  saved = await privatePatch(
    f,
    owner,
    { legalAddress: "Тестовый адрес 2" },
    saved.headers.get("etag"),
  );
  assert.equal(
    (await privateRead(f, owner)).body.values.company.inn,
    company.inn,
  );
  const storedPrivate = await privateRead(f, owner);
  assert.equal(
    storedPrivate.body.values.company.legalAddress,
    "Тестовый адрес 2",
  );
  const currentContext = await request(
    "GET",
    "/residents/" + owner.subject + "/context",
    "mstyle.resident.context.read",
  );
  const sources = currentContext.body.profiles.find(
    (row) => row.profileId === f.profileId,
  ).snapshotSources.primary;
  assert.equal(sources.privateData, saved.body.status.revision);
  pass(
    "P-03 ООО validation, string values, initial/partial save, P-01/P-02, stale-version rejection",
  );

  const snapshotRoute =
    "/resident-profiles/" + f.profileId + "/private-data/snapshots";
  const snapshotBody = schema({
    snapshotKind: "booking_legal_snapshot",
    contactPurpose: "primary",
    expectedSourceRevisions: sources,
  });
  await request("POST", snapshotRoute, "mstyle.resident.snapshot.create", {
    auth: owner,
    purpose: "booking_snapshot_create",
    status: 412,
    body: {
      ...snapshotBody,
      expectedSourceRevisions: { ...sources, profile: sources.profile + 1 },
    },
  });
  const snapshotOptions = {
    auth: owner,
    purpose: "booking_snapshot_create",
    status: 201,
    body: snapshotBody,
    headers: { "Idempotency-Key": uid() },
  };
  const [snapA, snapB] = await Promise.all([
    request(
      "POST",
      snapshotRoute,
      "mstyle.resident.snapshot.create",
      snapshotOptions,
    ),
    request(
      "POST",
      snapshotRoute,
      "mstyle.resident.snapshot.create",
      snapshotOptions,
    ),
  ]);
  assert.deepEqual(snapA.body, snapB.body);
  assert.deepEqual(snapA.body.sourceRevisions, sources);
  const snapshotId = snapA.body.snapshotId;
  assert.match(snapshotId, /^rps_/);
  const storedSnapshotId = snapshotId.replace(/^rps_/, "snp_");
  assert.equal(
    await db
      .collection("mstyle_v2_snapshots")
      .countDocuments({ partyId: f.profileId }),
    1,
  );
  const operationRef = {
    sourceSystem: "mstyle",
    environment: "local",
    operationType: "booking",
    operationId: "stage1-" + uid(),
  };
  const bindOptions = {
    headers: { "X-Actor-Ref": "system:outbox", "Idempotency-Key": uid() },
    body: schema({ operationRef }),
  };
  const [binding, parallelBinding] = await Promise.all([
    request(
      "POST",
      "/private-data-snapshots/" + snapshotId + "/operation-bindings",
      "mstyle.snapshot.operation.bind",
      bindOptions,
    ),
    request(
      "POST",
      "/private-data-snapshots/" + snapshotId + "/operation-bindings",
      "mstyle.snapshot.operation.bind",
      bindOptions,
    ),
  ]);
  assert.deepEqual(binding.body, parallelBinding.body);
  assert.equal(
    await db
      .collection("mstyle_v2_snapshot_bindings")
      .countDocuments({ snapshotId: storedSnapshotId }),
    1,
  );
  assert.equal(binding.body.status, "bound");
  assert.deepEqual(
    (
      await request(
        "POST",
        "/private-data-snapshots/" + snapshotId + "/operation-bindings",
        "mstyle.snapshot.operation.bind",
        bindOptions,
      )
    ).body,
    binding.body,
  );
  const snapshotRead = (part, fields, op = operationRef, status = 200) =>
    request(
      "POST",
      "/private-data-snapshots/" + snapshotId + "/" + part,
      part === "reveal"
        ? "mstyle.resident.snapshot.private.reveal"
        : "mstyle.resident.snapshot.contact.reveal",
      {
        status,
        headers: { "X-Actor-Ref": "system:delivery" },
        purpose: "booking_document_render",
        body: schema({ operationRef: op, fieldCodes: fields }),
      },
    );
  const frozen = await snapshotRead("reveal", [
    "company.fullName",
    "company.legalAddress",
  ]);
  const frozenContact = await snapshotRead("contacts/reveal", ["email"]);
  assert.equal(frozen.headers.get("cache-control"), "no-store, private");
  await snapshotRead(
    "contacts/reveal",
    ["email"],
    { ...operationRef, operationId: "wrong" },
    404,
  );
  await snapshotRead(
    "reveal",
    ["company.inn"],
    { ...operationRef, operationId: "wrong" },
    404,
  );
  saved = await privatePatch(
    f,
    owner,
    { legalAddress: "Тестовый адрес 3" },
    saved.headers.get("etag"),
  );
  // Change the source contact via the regular contact-verification endpoints below.
  const contactChallenge = await request(
    "POST",
    "/residents/" + owner.subject + "/contacts/challenges",
    "mstyle.resident.contact.write",
    {
      auth: owner,
      status: 201,
      body: schema({ contactType: "email", value: "changed-" + f.email }),
    },
  );
  assert.ok(contactChallenge.body.challengeId);
  const verified = await request(
    "POST",
    "/residents/" +
      owner.subject +
      "/contacts/challenges/" +
      contactChallenge.body.challengeId +
      "/verify",
    "mstyle.resident.contact.write",
    { auth: owner, body: schema({ code: "1234" }) },
  );
  const freshContacts = await request(
    "POST",
    "/residents/" + owner.subject + "/contacts/reveal",
    "mstyle.resident.contact.read",
    {
      auth: owner,
      purpose: "account_contact_view",
      body: schema({ fieldCodes: ["email"] }),
    },
  );
  const changedContact = freshContacts.body.contacts.find(
    (row) => row.value === "changed-" + f.email,
  );
  assert.ok(changedContact);
  c = await assignments(f, owner);
  await request(
    "PATCH",
    "/resident-profiles/" + f.profileId + "/contact-assignments",
    "mstyle.resident.contact.write",
    {
      auth: owner,
      purpose: "account_profile_edit",
      headers: { "If-Match": c.headers.get("etag") },
      body: schema({
        assignments: [
          { ...newAssignment, contactId: changedContact.contactId },
        ],
      }),
    },
  );

  fixtures.primary = { ...f, email: "changed-" + f.email };
  fixtures.snapshotId = snapshotId;
  fixtures.operationRef = operationRef;
  assert.deepEqual(
    (await snapshotRead("reveal", ["company.fullName", "company.legalAddress"]))
      .body,
    frozen.body,
  );
  assert.deepEqual(
    (await snapshotRead("contacts/reveal", ["email"])).body,
    frozenContact.body,
  );
  pass(
    "P-04 expected versions/concurrent retry, P-08 binding/retry, P-06/P-07 source versions and operation isolation",
  );

  const changeRoute = "/resident-profiles/" + r.profileId + "/change-requests";
  const change = async (address) =>
    request("POST", changeRoute, "mstyle.resident.change_request.write", {
      auth: requester,
      purpose: "profile_change_request",
      status: 201,
      headers: {
        "If-Match": (await profile(r, requester)).headers.get("etag"),
      },
      body: schema({
        reasonCode: "local_stage1",
        expectedPrivateDataRevision: (await privateStatus(r, requester)).body
          .revision,
        privateData: {
          profileType: "company",
          legalForm: "ooo",
          data: { legalAddress: address },
        },
      }),
    });
  const addressBefore = (await privateRead(r, requester)).body.values.company
    .legalAddress;
  await privatePatch(
    r,
    requester,
    { legalAddress: "direct write" },
    '"private-1"',
    409,
  );
  const cancel = await change("Отменённый адрес");
  assert.equal(
    (await privateRead(r, requester)).body.values.company.legalAddress,
    addressBefore,
  );
  await request(
    "GET",
    changeRoute + "/current",
    "mstyle.resident.change_request.read",
    { auth: requester },
  );
  await request(
    "POST",
    "/resident-profile-change-requests/" +
      cancel.body.changeRequestId +
      "/cancel",
    "mstyle.resident.change_request.write",
    {
      auth: requester,
      headers: { "If-Match": cancel.headers.get("etag") },
      body: schema({ reasonCode: "local_stage1" }),
    },
  );
  assert.equal(
    (await privateRead(r, requester)).body.values.company.legalAddress,
    addressBefore,
  );
  const reject = await change("Отклонённый адрес");
  await request(
    "POST",
    "/resident-profile-change-requests/" +
      reject.body.changeRequestId +
      "/decisions",
    "mstyle.integration.admin.change_request.decide",
    {
      admin: true,
      purpose: "profile_change_request",
      headers: { "If-Match": reject.headers.get("etag") },
      body: schema({ decision: "reject", reasonCode: "local_stage1" }),
    },
  );
  assert.equal(
    (await privateRead(r, requester)).body.values.company.legalAddress,
    addressBefore,
  );
  const approve = await change("Одобренный адрес");
  const decisionRoute =
    "/resident-profile-change-requests/" +
    approve.body.changeRequestId +
    "/decisions";
  const decisionOptions = {
    admin: true,
    purpose: "profile_change_request",
    headers: {
      "If-Match": approve.headers.get("etag"),
      "Idempotency-Key": uid(),
    },
    body: schema({ decision: "approve", reasonCode: "local_stage1" }),
  };
  const decision = await request(
    "POST",
    decisionRoute,
    "mstyle.integration.admin.change_request.decide",
    decisionOptions,
  );
  const retry = await request(
    "POST",
    decisionRoute,
    "mstyle.integration.admin.change_request.decide",
    decisionOptions,
  );
  assert.deepEqual(retry.body, decision.body);
  await request(
    "POST",
    decisionRoute,
    "mstyle.integration.admin.change_request.decide",
    { ...decisionOptions, actor: "wp-admin:8", status: 409 },
  );
  assert.equal(
    (await privateRead(r, requester)).body.values.company.legalAddress,
    "Одобренный адрес",
  );
  assert.equal(
    (await privateStatus(r, requester)).body.editPolicy,
    "request_only",
  );
  const stale = await change("Устаревшее предложение");
  // A concurrent writer changes the profile version after R-11.
  await db
    .collection("mstyle_v2_profiles")
    .updateOne({ profileId: r.profileId }, { $inc: { revision: 1 } });
  await request(
    "POST",
    "/resident-profile-change-requests/" +
      stale.body.changeRequestId +
      "/decisions",
    "mstyle.integration.admin.change_request.decide",
    {
      admin: true,
      purpose: "profile_change_request",
      status: 412,
      headers: { "If-Match": stale.headers.get("etag") },
      body: schema({ decision: "approve", reasonCode: "local_stage1" }),
    },
  );
  assert.equal(
    (await privateRead(r, requester)).body.values.company.legalAddress,
    "Одобренный адрес",
  );
  const pending = await db
    .collection("mstyle_v2_change_requests")
    .findOne({ changeRequestId: stale.body.changeRequestId });
  assert.equal(pending.status, "pending");
  assert.equal(pending.changeRequestRevision, 1);
  await request(
    "POST",
    "/resident-profile-change-requests/" +
      stale.body.changeRequestId +
      "/cancel",
    "mstyle.resident.change_request.write",
    {
      auth: requester,
      headers: { "If-Match": stale.headers.get("etag") },
      body: schema({ reasonCode: "local_stage1" }),
    },
  );
  const expired = await change("Истёкшее предложение");
  await db
    .collection("mstyle_v2_change_requests")
    .updateOne(
      { changeRequestId: expired.body.changeRequestId },
      { $set: { expiresAt: new Date(Date.now() - 1000).toISOString() } },
    );
  await request(
    "POST",
    "/resident-profile-change-requests/" +
      expired.body.changeRequestId +
      "/decisions",
    "mstyle.integration.admin.change_request.decide",
    {
      admin: true,
      purpose: "profile_change_request",
      status: 409,
      headers: { "If-Match": expired.headers.get("etag") },
      body: schema({ decision: "approve", reasonCode: "local_stage1" }),
    },
  );
  assert.equal(
    (await privateRead(r, requester)).body.values.company.legalAddress,
    "Одобренный адрес",
  );
  await request(
    "GET",
    changeRoute + "/current",
    "mstyle.resident.change_request.read",
    { auth: requester },
  );
  pass(
    "R-11/R-12/R-16 and R-15 cancel/reject/approve, stale/expired requests, request_only, idempotency and actor binding",
  );

  const adminReadRoute = "/identities/" + owner.subject,
    adminScope = "mstyle.integration.admin.identity.read";
  const accepted = await request("GET", adminReadRoute, adminScope, {
    admin: true,
  });
  await request("GET", adminReadRoute, adminScope, {
    admin: true,
    assertion: accepted.sentHeaders["X-Admin-Step-Up-Assertion"],
    headers: { "X-Request-ID": accepted.sentHeaders["X-Request-ID"] },
    status: 403,
  });
  const now = Math.floor(Date.now() / 1000);
  const oauthJwt = signed("JWT", {
    iss: clientId,
    sub: clientId,
    aud: urls.backend + "/api/oauth2/token",
    iat: now,
    exp: now + 55,
    jti: nonce(),
  });
  await request("GET", adminReadRoute, adminScope, {
    admin: true,
    assertion: oauthJwt,
    status: 403,
  });
  const wrongType = await fetch(urls.backend + "/api/oauth2/token", {
    method: "POST",
    redirect: "error",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      scope: adminScope,
      client_assertion_type:
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: accepted.sentHeaders["X-Admin-Step-Up-Assertion"],
    }),
  });
  assert.equal(wrongType.status, 401);
  assert.equal((await wrongType.json()).error, "invalid_client");
  const missing = await request("GET", adminReadRoute, adminScope, {
    admin: true,
    assertion: null,
    status: 403,
  });
  assert.equal(missing.body.errors[0].code, "required");
  for (const claims of [
    { sub: "wp-admin:8" },
    { aud: "https://wrong.invalid" },
    { scope: "mstyle.profiles.read" },
    { target: prefix + adminReadRoute + "?x=1" },
    { requestId: "wrong" },
    { iat: 1, exp: 60 },
  ]) {
    const bad = await request("GET", adminReadRoute, adminScope, {
      admin: true,
      claims,
      status: 403,
    });
    assert.equal(bad.body.code, "ADMIN_ASSERTION_INVALID");
  }
  await request("GET", adminReadRoute, adminScope, {
    admin: true,
    headers: { "X-Resident-Subject": owner.subject },
    status: 422,
  });
  for (const name of [
    "Authorization",
    "X-Actor-Ref",
    "X-Admin-Step-Up-Assertion",
    "X-Request-ID",
    "X-Purpose-Code",
    "If-Match",
    "Idempotency-Key",
  ])
    assert.equal((await rawDuplicate(name)).status, 422);
  const audit = await db.collection("mstyle_v2_admin_assertion_audit").findOne({
    requestId: accepted.sentHeaders["X-Request-ID"],
    result: "accepted",
  });
  assert.ok(audit?.jti);
  assert.ok(!JSON.stringify(audit).includes("eyJ"));
  await request(
    "POST",
    "/resident-profiles/search",
    "mstyle.integration.admin.profile.read",
    {
      admin: true,
      purpose: "admin_support_review",
      body: schema({
        query: { type: "profileId", value: f.profileId },
        limit: 10,
      }),
    },
  );
  const guestPartyId = Ids.guest();
  await db.collection("mstyle_v2_guest_parties").insertOne({
    guestPartyId,
    status: "active",
    purpose: "booking",
    role: "primary",
    privateDataRevision: null,
    revision: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const guest = await request(
    "POST",
    "/guest-parties/search",
    "mstyle.integration.admin.guest.read",
    {
      admin: true,
      purpose: "admin_support_review",
      body: schema({
        query: { type: "guestPartyId", value: guestPartyId },
        limit: 10,
      }),
    },
  );
  assert.equal(guest.body.items.length, 1);
  fixtures.guestPartyId = guestPartyId;
  pass(
    "Admin JWT: R-06/R-14/G-12, signature/bindings/replay/duplicate headers and audit",
  );

  await require("./hardening-http-test.cjs")({
    db,
    request,
    fixture,
    login,
    schema,
    pass,
  });
  await require("./format-test.cjs")({
    db,
    request,
    fixture,
    login,
    schema,
    pass,
    fixtures,
    owner,
    history,
  });
  await require("./identity-ownership-test.cjs")({
    db,
    nativeDb: mongo.db("pass_local_auth"),
    request,
    fixture,
    login,
    schema,
    pass,
  });

  fs.writeFileSync(
    path.join(stateDir, "stage1-fixtures.json"),
    JSON.stringify(fixtures, null, 2),
  );
  fs.writeFileSync(
    path.join(stateDir, "stage1-result.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        checks,
        fixtures,
        httpRequests: history.length,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: stage 1 (" +
      checks.length +
      " groups, " +
      history.length +
      " HTTP requests)",
  );
}
async function close() {
  fs.writeFileSync(
    path.join(stateDir, "stage1-http.json"),
    JSON.stringify(history, null, 2),
  );
  await mongo.close();
}
module.exports = { request, login, main, close };
if (require.main === module)
  main()
    .catch((error) => {
      console.error(error.stack || error);
      process.exitCode = 1;
    })
    .finally(close);
