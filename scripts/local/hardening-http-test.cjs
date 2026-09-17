"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { settings, urls, root } = require("./config.cjs");
const { Ids } = require(
  path.join(root, "backend/dist/integrations/mstyle-v2/mstyle-v2.ids"),
);
module.exports = async ({ db, request, fixture, login, schema, pass }) => {
  const uid = () => crypto.randomUUID();
  const f = await fixture("Границы доступа");
  const auth = await login(f.email);
  const otpContext = {
    ipAddress: "127.0.0.1",
    userAgent: "Local concurrent OTP acceptance",
    locale: "ru-RU",
  };
  const startOtp = (key = uid(), status = 202) =>
    request(
      "POST",
      "/auth/residents/code-challenges",
      "mstyle.resident.authenticate",
      {
        status,
        headers: { "Idempotency-Key": key },
        body: schema({
          identifier: { type: "email", value: f.email },
          channel: "email",
          context: otpContext,
        }),
      },
    );
  const verifyOtp = (challenge, code, status, key = uid()) =>
    request(
      "POST",
      "/auth/residents/code-challenges/" +
        challenge.body.challengeId +
        "/verify",
      "mstyle.resident.authenticate",
      {
        status,
        headers: { "Idempotency-Key": key },
        body: schema({ code, context: otpContext }),
      },
    );
  const badOtp = await startOtp();
  const dispatchKey = uid();
  const dispatches = await Promise.all([
    startOtp(dispatchKey, [202, 503]),
    startOtp(dispatchKey, [202, 503]),
  ]);
  const dispatched = dispatches.find((row) => row.status === 202);
  assert.ok(dispatched);
  assert.deepEqual((await startOtp(dispatchKey)).body, dispatched.body);
  assert.equal(
    (
      await db
        .collection("mstyle_v2_idempotency")
        .findOne({ idempotencyKey: dispatchKey })
    ).statusCode,
    202,
  );
  pass(
    "A-03: one dispatch reservation and stable response for concurrent and later repeats",
  );
  const failedOtp = await Promise.all(
    Array.from({ length: 7 }, () => verifyOtp(badOtp, "0000", [401, 429])),
  );
  assert.equal(failedOtp.filter((row) => row.status === 401).length, 5);
  assert.equal(
    (
      await db
        .collection("mstyle_v2_challenges")
        .findOne({ challengeId: badOtp.body.challengeId })
    ).verifyAttempts,
    5,
  );
  const goodOtp = await startOtp();
  const authKey = uid();
  const successfulOtp = await Promise.all([
    verifyOtp(goodOtp, "1234", 200, authKey),
    verifyOtp(goodOtp, "1234", 200, authKey),
  ]);
  assert.deepEqual(successfulOtp[0].body, successfulOtp[1].body);
  assert.equal(
    await db.collection("mstyle_v2_authentications").countDocuments({
      authenticationId: successfulOtp[0].body.authenticationId,
    }),
    1,
  );
  pass(
    "A-06: five concurrent failed attempts and one authentication for concurrent successful verification",
  );
  const base = "/resident-profiles/" + f.profileId;
  const calls = (m, r, scope, opt = {}) =>
    request(m, r, scope, { auth, ...opt });
  const membership = await db
    .collection("mstyle_v2_memberships")
    .findOne({ profileId: f.profileId, subject: f.subject });
  await db
    .collection("mstyle_v2_memberships")
    .updateOne(
      { _id: membership._id },
      { $set: { validFrom: new Date(Date.now() + 3600000).toISOString() } },
    );
  await calls("GET", base, "mstyle.resident.profile.read", { status: 404 });
  await db
    .collection("mstyle_v2_memberships")
    .updateOne(
      { _id: membership._id },
      { $set: { validFrom: membership.validFrom } },
    );
  const started = [];
  for (let i = 0; i < 3; i++)
    started.push(
      await calls(
        "POST",
        "/residents/" + f.subject + "/contacts/challenges",
        "mstyle.resident.contact.write",
        {
          status: 201,
          body: schema({
            contactType: "phone",
            value: "+7999" + String(crypto.randomInt(1000000, 9999999)),
          }),
        },
      ),
    );
  const verify = (n, code, status = 200, key = uid()) =>
    calls(
      "POST",
      "/residents/" +
        f.subject +
        "/contacts/challenges/" +
        started[n].body.challengeId +
        "/verify",
      "mstyle.resident.contact.write",
      { status, headers: { "Idempotency-Key": key }, body: schema({ code }) },
    );
  const wrong = await Promise.all(
    Array.from({ length: 7 }, () => verify(0, "0000", [401, 429])),
  );
  assert.equal(wrong.filter((r) => r.status === 401).length, 5);
  const stored = await db
    .collection("mstyle_v2_challenges")
    .findOne({ challengeId: started[0].body.challengeId });
  assert.equal(stored.verifyAttempts, 5);
  const key = uid();
  const verified = await Promise.all([
    verify(1, "1234", 200, key),
    verify(1, "1234", 200, key),
  ]);
  assert.deepEqual(verified[0].body, verified[1].body);
  await verify(2, "1234", 412);
  assert.equal(
    (
      await db
        .collection("mstyle_v2_challenges")
        .findOne({ challengeId: started[2].body.challengeId })
    ).status,
    "awaiting_code",
  );
  pass(
    "Contact proof: five concurrent failed attempts, one successful concurrent replay, stale contact version rolls back consumption",
  );
  const cset = await calls(
    "GET",
    "/residents/" + f.subject + "/consents",
    "mstyle.resident.consent.read",
  );
  const def = cset.body.items[0];
  const consentRoute =
    "/residents/" + f.subject + "/consents/" + def.documentCode;
  const consentBody = schema({
    documentVersion: def.documentVersion,
    documentDigest: def.documentDigest,
    locale: def.locale,
    evidenceCode: "account_checkbox",
  });
  const options = {
    headers: { "If-Match": cset.headers.get("etag"), "Idempotency-Key": uid() },
    body: consentBody,
  };
  const accepted = await Promise.all([
    calls(
      "POST",
      consentRoute + "/accept",
      "mstyle.resident.consent.write",
      options,
    ),
    calls(
      "POST",
      consentRoute + "/accept",
      "mstyle.resident.consent.write",
      options,
    ),
  ]);
  assert.deepEqual(accepted[0].body, accepted[1].body);
  await calls(
    "POST",
    consentRoute + "/withdraw",
    "mstyle.resident.consent.write",
    {
      status: 412,
      headers: { "If-Match": cset.headers.get("etag") },
      body: schema({ reasonCode: "resident_preference_changed" }),
    },
  );
  const withdrawn = await calls(
    "POST",
    consentRoute + "/withdraw",
    "mstyle.resident.consent.write",
    {
      headers: { "If-Match": accepted[0].headers.get("etag") },
      body: schema({ reasonCode: "resident_preference_changed" }),
    },
  );
  assert.equal(withdrawn.body.item.status, "withdrawn");
  assert.equal(
    (
      await db
        .collection("mstyle_v2_consents")
        .findOne({ partyId: f.subject, documentCode: def.documentCode })
    ).history.length,
    2,
  );
  pass(
    "Resident consents: current document, concurrent idempotency, stale If-Match, withdrawal history",
  );
  const memberEmail = "transfer-" + uid() + "@pass24.local";
  const beforeInvite = await calls("GET", base, "mstyle.resident.profile.read");
  const beforeRoster = await calls(
    "GET",
    base + "/memberships",
    "mstyle.resident.members.read",
  );
  const invite = await calls(
    "POST",
    base + "/memberships",
    "mstyle.resident.members.write",
    {
      status: 201,
      purpose: "membership_invitation",
      headers: { "If-Match": beforeRoster.headers.get("etag") },
      body: schema({
        expectedRevisions: {
          profile: beforeInvite.body.revision,
          membershipSet: beforeRoster.body.membershipSetRevision,
        },
        identity: {
          invitation: { displayName: "Новый владелец", email: memberEmail },
        },
      }),
    },
  );
  const memberAuth = await login(memberEmail);
  await request(
    "POST",
    base + "/private-data/reveal",
    "mstyle.resident.private.reveal",
    {
      status: 404,
      auth: memberAuth,
      purpose: "account_profile_view",
      body: schema({ fieldCodes: ["company.fullName"] }),
    },
  );
  const profile = await calls("GET", base, "mstyle.resident.profile.read");
  const roster = await calls(
    "GET",
    base + "/memberships",
    "mstyle.resident.members.read",
  );
  const transfer = {
    headers: { "Idempotency-Key": uid() },
    body: schema({
      newOwnerSubject: memberAuth.subject,
      expectedProfileRevision: profile.body.revision,
      expectedMembershipSetRevision: roster.body.membershipSetRevision,
      reasonCode: "local_acceptance",
    }),
  };
  const ownerScope = "mstyle.resident.members.write";
  const changed = await Promise.all([
    calls("POST", base + "/owner-transfer", ownerScope, transfer),
    calls("POST", base + "/owner-transfer", ownerScope, transfer),
  ]);
  assert.deepEqual(changed[0].body, changed[1].body);
  assert.equal(
    await db.collection("mstyle_v2_memberships").countDocuments({
      profileId: f.profileId,
      role: "owner",
      status: "active",
    }),
    1,
  );
  assert.equal(changed[0].body.newOwner.subject, memberAuth.subject);
  pass(
    "Memberships: future validity denied, employee P-02 denied, concurrent M-05 changes one owner with one result",
  );
  const onboardingBody = schema({
    owner: {
      invitation: {
        displayName: "Локальный новый резидент",
        email: "onboarding-" + uid() + "@pass24.local",
      },
    },
    profile: { type: "company", legalForm: "ooo", label: "Локальное ООО" },
    privateData: {
      profileType: "company",
      legalForm: "ooo",
      data: {
        fullName: "Локальное ООО",
        inn: "0000000000",
        ogrn: "0000000000000",
      },
    },
    initialContactAssignments: [
      {
        purpose: "primary",
        source: { kind: "owner_invitation_contact", contactType: "email" },
        priority: 1,
      },
    ],
    sourceLink: {
      sourceSystem: "mstyle-wordpress",
      environment: "local",
      entityType: "resident",
      externalId: "local-" + uid(),
    },
  });
  const onboardingOptions = {
    admin: true,
    purpose: "resident_onboarding",
    status: 201,
    headers: { "Idempotency-Key": uid() },
    body: onboardingBody,
  };
  const onboarded = await Promise.all([
    request(
      "POST",
      "/resident-onboarding",
      "mstyle.integration.admin.onboarding.write",
      onboardingOptions,
    ),
    request(
      "POST",
      "/resident-onboarding",
      "mstyle.integration.admin.onboarding.write",
      onboardingOptions,
    ),
  ]);
  assert.deepEqual(onboarded[0].body, onboarded[1].body);
  assert.equal(
    await db.collection("mstyle_v2_profiles").countDocuments({
      "sourceLinks.externalId": onboardingBody.sourceLink.externalId,
    }),
    1,
  );
  assert.equal(
    await db
      .collection("mstyle_v2_private_data")
      .countDocuments({ partyId: onboarded[0].body.profileId }),
    1,
  );
  await request(
    "POST",
    "/resident-onboarding",
    "mstyle.integration.admin.onboarding.write",
    {
      ...onboardingOptions,
      status: 409,
      headers: { "Idempotency-Key": uid() },
    },
  );
  pass(
    "R-08: concurrent onboarding creates one profile, private record, owner and replay result",
  );
  const cfg = settings();
  const deletionTarget = await fixture("Заявка на удаление");
  const deletionProfile = await db
    .collection("mstyle_v2_profiles")
    .findOne({ profileId: deletionTarget.profileId });
  const createDeletion = (status) =>
    request(
      "POST",
      "/resident-profiles/" + deletionTarget.profileId + "/deletion-requests",
      "mstyle.integration.admin.profile.write",
      {
        admin: true,
        status,
        headers: { "If-Match": '"profile-' + deletionProfile.revision + '"' },
        body: schema({ mode: "anonymize", reasonCode: "client_request" }),
      },
    );
  const concurrentDeletions = await Promise.all([
    createDeletion([202, 409]),
    createDeletion([202, 409]),
  ]);
  assert.deepEqual(concurrentDeletions.map((r) => r.status).sort(), [202, 409]);
  const deletionId = concurrentDeletions.find((r) => r.status === 202).body
    .deletionRequestId;
  await db
    .collection("mstyle_v2_deletion_requests")
    .updateOne(
      { deletionRequestId: deletionId },
      { $set: { status: "blocked" } },
    );
  await createDeletion(409);
  await db
    .collection("mstyle_v2_deletion_requests")
    .updateOne(
      { deletionRequestId: deletionId },
      { $set: { status: "rejected" } },
    );
  await createDeletion(202);
  pass(
    "Deletion requests: concurrent creation, blocked request conflict, new request after rejection without completedAt",
  );
  const loginResponse = await fetch(urls.backend + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login: cfg.adminUsername,
      password: cfg.adminPassword,
    }),
  });
  assert.equal(loginResponse.status, 201);
  const native = await loginResponse.json();
  const probeResponse = await fetch(
    urls.backend + "/api/admin/integration/probe-token",
    { method: "POST", headers: { Authorization: "Bearer " + native.token } },
  );
  assert.equal(probeResponse.status, 201);
  const probe = await probeResponse.json();
  const nativeHeaders = {
    Authorization: "Bearer " + probe.access_token,
    "X-Actor-Ref": "wp-admin:api-console",
    "X-Admin-Step-Up-Assertion": native.token,
  };
  await request(
    "GET",
    "/identities/" + f.subject,
    "mstyle.integration.admin.identity.read",
    { headers: nativeHeaders },
  );
  await request(
    "GET",
    "/identities/" + f.subject,
    "mstyle.integration.admin.identity.read",
    {
      status: 422,
      headers: {
        "X-Actor-Ref": "wp-admin:api-console",
        "X-Admin-Step-Up-Assertion": native.token,
      },
    },
  );
  pass(
    "Native console: existing admin login, probe token and native assertion accepted",
  );
};
