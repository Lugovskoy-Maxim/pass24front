"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
module.exports = async function ({
  db,
  request,
  schema,
  forms,
  pass,
  form = forms.individual,
}) {
  const uid = () => crypto.randomUUID();
  const created = await request(
    "POST",
    "/guest-parties",
    "mstyle.guest.create",
    {
      status: 201,
      headers: { "X-Actor-Ref": "guest:booking" },
      purpose: "guest_booking_registration",
      body: schema({ partyPurpose: "mstyle_booking" }),
    },
  );
  const guestId = created.body.guestPartyId;
  const guestToken = created.body.guestFlowAccessToken;
  const route = "/guest-parties/" + guestId;
  const call = (method, suffix, scope, options = {}) =>
    request(method, route + suffix, scope, {
      ...options,
      guestToken,
      headers: { "X-Actor-Ref": "guest:" + guestId, ...options.headers },
    });
  await request("GET", route + "/status", "mstyle.guest.read", { status: 403 });
  await request(
    "GET",
    route.replace(guestId, guestId + "x") + "/status",
    "mstyle.guest.read",
    { status: 403, guestToken, headers: { "X-Actor-Ref": "guest:" + guestId } },
  );
  await call("POST", "/private-data/reveal", "mstyle.guest.private.reveal", {
    status: 403,
    body: schema({ fieldCodes: ["individual.passport.fullName"] }),
  });
  const email = "guest-" + uid() + "@pass24.local";
  const challenge = await call(
    "POST",
    "/contact-challenges",
    "mstyle.guest.contact.verify",
    {
      status: 201,
      purpose: "guest_booking_registration",
      body: schema({ contactType: "email", value: email }),
    },
  );
  assert.ok(challenge.body.expectedContactValueRevision > 0);
  const verifyRoute =
    "/contact-challenges/" + challenge.body.challengeId + "/verify";
  const key = uid();
  await call("POST", verifyRoute, "mstyle.guest.contact.verify", {
    status: 401,
    purpose: "guest_booking_registration",
    headers: { "Idempotency-Key": key },
    body: schema({ code: "0000" }),
  });
  const verified = await call(
    "POST",
    verifyRoute,
    "mstyle.guest.contact.verify",
    {
      purpose: "guest_booking_registration",
      headers: { "Idempotency-Key": key },
      body: schema({ code: "1234" }),
    },
  );
  assert.equal(verified.body.guestPartyStatus, "verified");
  assert.match(verified.body.contact.contactId, /^ict_/);
  const cached = await call(
    "POST",
    verifyRoute,
    "mstyle.guest.contact.verify",
    {
      purpose: "guest_booking_registration",
      headers: { "Idempotency-Key": key },
      body: schema({ code: "1234" }),
    },
  );
  assert.deepEqual(cached.body, verified.body);
  assert.equal(
    (
      await db
        .collection("mstyle_v2_challenges")
        .findOne({ challengeId: challenge.body.challengeId })
    ).verifyAttempts,
    2,
  );
  const consent = await call("GET", "/consents", "mstyle.guest.consent.read");
  const document = consent.body.items.find(
    (d) => d.documentCode === "personal_data_processing",
  );
  assert.equal(document.status, "required");
  const acceptBody = schema({
    documentVersion: document.documentVersion,
    documentDigest: document.documentDigest,
    locale: document.locale,
    evidenceCode: "booking_checkbox",
  });
  const consentRoute = "/consents/personal_data_processing/accept";
  await call("POST", consentRoute, "mstyle.guest.consent.write", {
    status: 412,
    body: acceptBody,
  });
  await call("POST", consentRoute, "mstyle.guest.consent.write", {
    status: 422,
    headers: { "If-Match": consent.headers.get("etag") },
    body: { ...acceptBody, documentDigest: "sha256:" + "0".repeat(64) },
  });
  const accepted = await call(
    "POST",
    consentRoute,
    "mstyle.guest.consent.write",
    { headers: { "If-Match": consent.headers.get("etag") }, body: acceptBody },
  );
  assert.ok(accepted.body.consentSetRevision > consent.body.consentSetRevision);
  assert.match(accepted.body.item.auditRef, /^aud_/);
  const savedConsent = await db
    .collection("mstyle_v2_consents")
    .findOne({ partyId: guestId, documentCode: document.documentCode });
  assert.equal(savedConsent.history.at(-1).evidenceCode, "booking_checkbox");
  const before = await call(
    "GET",
    "/private-data/status",
    "mstyle.guest.private.status.read",
  );
  const patched = await call(
    "PATCH",
    "/private-data",
    "mstyle.guest.private.write",
    {
      purpose: "guest_booking_registration",
      headers: { "If-Match": before.headers.get("etag") },
      body: schema({
        displayName: "Локальный гость",
        privateData: form,
      }),
    },
  );
  assert.equal(patched.headers.get("etag"), '"private-1"');
  assert.equal(patched.body.status.complete, true);
  assert.equal(patched.body.status.profileType, form.profileType);
  assert.equal(patched.body.status.legalForm, form.legalForm || null);
  const state = await call("GET", "/status", "mstyle.guest.read");
  const snapshotBody = schema({
    snapshotKind: "booking_legal_snapshot",
    contactPurpose: "primary",
    expectedSourceRevisions: {
      guestParty: state.body.revision,
      guestContacts: { phone: null, email: verified.body.contact.revision },
      privateData: patched.body.status.revision,
    },
  });
  await call("POST", "/snapshots", "mstyle.guest.snapshot.create", {
    status: 412,
    purpose: "booking_snapshot_create",
    body: {
      ...snapshotBody,
      expectedSourceRevisions: {
        ...snapshotBody.expectedSourceRevisions,
        guestParty: 1,
      },
    },
  });
  const guestSnapshot = await call(
    "POST",
    "/snapshots",
    "mstyle.guest.snapshot.create",
    { status: 201, purpose: "booking_snapshot_create", body: snapshotBody },
  );
  assert.match(guestSnapshot.body.snapshotId, /^gps_/);
  await call("POST", "/booking-confirmations", "mstyle.guest.booking.confirm", {
    status: 403,
    body: schema({
      snapshotId: guestSnapshot.body.snapshotId,
      operationRef: {
        sourceSystem: "mstyle",
        environment: "local",
        operationType: "booking",
        operationId: "forbidden",
      },
    }),
  });
  pass(
    "Guest: real G-01 token, isolated access, G-02/G-03 OTP and replay, G-13/G-14 consent, canonical G-08 and versioned G-09",
  );
  return { guestId, guestToken, guestSnapshot, call };
};
