"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { root, stateDir, settings } = require("./config.cjs");
const { Ids } = require(
  path.join(root, "backend/dist/integrations/mstyle-v2/mstyle-v2.ids"),
);
const { encryptJson, hmacHex, maskContact } = require(
  path.join(root, "backend/dist/integrations/mstyle-v2/mstyle-v2.crypto"),
);
const uid = () => crypto.randomUUID();

// Runs only from the local acceptance harness after its address/database checks.
module.exports = async function formatTests({
  db,
  request,
  fixture,
  login,
  schema,
  pass,
  fixtures,
  owner,
  history,
}) {
  const cfg = settings();
  const f = fixtures.primary;
  const snapshotId = fixtures.snapshotId;
  const internalId = snapshotId.replace(/^rps_/, "snp_");
  const storedSnapshot = await db
    .collection("mstyle_v2_snapshots")
    .findOne({ snapshotId: internalId });
  assert.ok(storedSnapshot);
  const bindRoute = (id) =>
    "/private-data-snapshots/" + id + "/operation-bindings";
  const bindRequest = history.find(
    (row) => row.route === bindRoute(snapshotId) && row.status === 200,
  );
  const bindingRecord = await db
    .collection("mstyle_v2_idempotency")
    .findOne({ idempotencyKey: bindRequest.idempotencyKey });
  assert.ok(bindingRecord);
  // Simulate a response stored by the old version. Business rows are untouched.
  const legacyBinding = {
    ...bindingRecord.responseBody,
    snapshotId: internalId,
  };
  await db
    .collection("mstyle_v2_idempotency")
    .updateOne(
      { _id: bindingRecord._id },
      { $set: { responseBody: legacyBinding } },
    );
  for (const id of [internalId, snapshotId]) {
    const result = await request(
      "POST",
      bindRoute(id),
      "mstyle.snapshot.operation.bind",
      {
        headers: {
          "X-Actor-Ref": "system:outbox",
          "Idempotency-Key": bindRequest.idempotencyKey,
        },
        body: bindRequest.request,
      },
    );
    assert.equal(result.body.snapshotId, snapshotId);
    assert.deepEqual(result.body, bindRequest.response);
  }
  assert.deepEqual(
    (
      await db
        .collection("mstyle_v2_idempotency")
        .findOne({ _id: bindingRecord._id })
    ).responseBody,
    legacyBinding,
  );
  assert.equal(
    await db
      .collection("mstyle_v2_snapshot_bindings")
      .countDocuments({ snapshotId: internalId }),
    1,
  );
  const creation = history.find(
    (row) => row.response?.snapshotId === snapshotId && row.status === 201,
  );
  const replay = await db
    .collection("mstyle_v2_idempotency")
    .findOne({ idempotencyKey: creation.idempotencyKey });
  await db
    .collection("mstyle_v2_idempotency")
    .updateOne(
      { _id: replay._id },
      { $set: { "responseBody.snapshotId": internalId } },
    );
  const cached = await request(
    "POST",
    creation.route,
    "mstyle.resident.snapshot.create",
    {
      auth: owner,
      purpose: "booking_snapshot_create",
      status: 201,
      headers: { "Idempotency-Key": creation.idempotencyKey },
      body: creation.request,
    },
  );
  assert.deepEqual(cached.body, creation.response);
  const reveal = (
    id,
    scope,
    status = 200,
    operationRef = fixtures.operationRef,
    fieldCodes = ["company.fullName"],
  ) =>
    request("POST", "/private-data-snapshots/" + id + "/reveal", scope, {
      headers: { "X-Actor-Ref": "system:delivery" },
      purpose: "booking_document_render",
      status,
      body: schema({ operationRef, fieldCodes }),
    });
  await reveal(internalId, "mstyle.resident.snapshot.private.reveal");
  await reveal(
    snapshotId.replace(/^rps_/, "gps_"),
    "mstyle.guest.snapshot.private.reveal",
    404,
  );
  await reveal(snapshotId, "mstyle.guest.snapshot.private.reveal", 403);
  assert.deepEqual(
    await db
      .collection("mstyle_v2_snapshots")
      .findOne({ snapshotId: internalId }),
    storedSnapshot,
  );
  pass(
    "Formats: old snapshot IDs and cached responses, shared replay key, typed-party/scope checks, immutable storage",
  );

  const contactRoute = "/residents/" + owner.subject + "/contacts/challenges";
  await request("POST", contactRoute, "mstyle.resident.contact.write", {
    auth: owner,
    status: 201,
    body: schema({ type: "email", value: "legacy-" + f.email }),
  });
  await request("POST", contactRoute, "mstyle.resident.contact.write", {
    auth: owner,
    status: 422,
    body: schema({ type: "phone", contactType: "email", value: f.email }),
  });
  const assignmentRoute =
    "/resident-profiles/" + f.profileId + "/contact-assignments";
  let roster = await request(
    "GET",
    assignmentRoute,
    "mstyle.resident.contact.read",
    { auth: owner },
  );
  const original = roster.body.items.find((row) => row.status === "active");
  const item = {
    purpose: original.purpose,
    subject: original.subject,
    contactId: original.contactId,
    priority: original.priority,
  };
  for (const status of ["revoked", "inactive", "active"]) {
    roster = await request(
      "PATCH",
      assignmentRoute,
      "mstyle.resident.contact.write",
      {
        auth: owner,
        purpose: "account_profile_edit",
        headers: { "If-Match": roster.headers.get("etag") },
        body: schema({ assignments: [{ ...item, status }] }),
      },
    );
    assert.equal(roster.body.items[0].assignmentId, original.assignmentId);
    assert.match(roster.body.items[0].assignmentId, /^pca_/);
    assert.equal(
      roster.body.items[0].status,
      status === "active" ? "active" : "revoked",
    );
    const stored = await db
      .collection("mstyle_v2_contact_assignments")
      .findOne({ profileId: f.profileId });
    assert.equal(
      stored.assignmentId,
      original.assignmentId.replace(/^pca_/, "cas_"),
    );
    assert.equal(stored.status, status === "active" ? "active" : "inactive");
  }
  pass(
    "Formats: C-01 canonical/legacy discriminator, ambiguity rejection, C-04 revoked/inactive round trip",
  );

  const theme =
    process.env.MSTYLE_THEME_PATH ||
    "C:/Работа/Kwork/mstyle.na4u.ru/wp-content/themes/tf-mstyle-theme";
  const php = process.env.PHP_BINARY || "C:/php/php.exe";
  const forms = JSON.parse(
    execFileSync(
      php,
      [path.join(__dirname, "mstyle-contract-check.php"), theme, "--forms"],
      { encoding: "utf8" },
    ),
  );
  const person = await fixture("Локальное физическое лицо");
  await db.collection("mstyle_v2_profiles").updateOne(
    { profileId: person.profileId },
    {
      $set: {
        type: "individual",
        legalForm: null,
        sourceLinks: [
          {
            sourceSystem: "mstyle-wordpress",
            environment: "local",
            entityType: "resident",
            externalId: "mstyle-user:" + uid(),
            linkedAt: new Date().toISOString(),
          },
        ],
      },
    },
  );
  const personAuth = await login(person.email);
  const personRoute = "/resident-profiles/" + person.profileId;
  await request("GET", personRoute, "mstyle.resident.profile.read", {
    auth: personAuth,
  });
  const before = await request(
    "GET",
    personRoute + "/private-data/status",
    "mstyle.resident.private.status.read",
    { auth: personAuth },
  );
  const updated = await request(
    "PATCH",
    personRoute + "/private-data",
    "mstyle.resident.private.write",
    {
      auth: personAuth,
      purpose: "account_profile_edit",
      headers: { "If-Match": before.headers.get("etag") },
      body: schema({ privateData: forms.individual }),
    },
  );
  const values = await request(
    "POST",
    personRoute + "/private-data/reveal",
    "mstyle.resident.private.reveal",
    {
      auth: personAuth,
      purpose: "account_profile_view",
      body: schema({
        fieldCodes: [
          "individual.passport.fullName",
          "individual.passport.number",
          "individual.birthDate",
        ],
      }),
    },
  );
  assert.equal(
    values.body.values.individual.passport.fullName,
    forms.individual.data.passport.fullName,
  );
  assert.equal(
    values.body.values.individual.passport.number,
    forms.individual.data.passport.number,
  );
  assert.deepEqual(Object.keys(values.body.sourceRevisions).sort(), [
    "privateData",
    "profile",
  ]);
  assert.equal(values.body.revision, updated.body.status.revision);
  pass(
    "Formats: actual PHP individual form -> P-03 -> P-02, structured passport and populated R-04 sourceLinks",
  );

  const { guestId, guestSnapshot } = await require("./guest-workflow-test.cjs")(
    { db, request, schema, forms, pass },
  );
  for (const legalForm of ["ooo", "ip"]) {
    await require("./guest-workflow-test.cjs")({
      db,
      request,
      schema,
      forms,
      pass,
      form: {
        profileType: "company",
        legalForm,
        data:
          legalForm === "ooo"
            ? {
                fullName: "Локальное ООО",
                inn: "0000000000",
                ogrn: "0000000000000",
              }
            : { inn: "000000000000", ogrnip: "000000000000000" },
      },
    });
  }
  const guestOp = {
    ...fixtures.operationRef,
    operationId: Ids.request().replace(/^req_/, "op_"),
  };
  await request(
    "POST",
    bindRoute(guestSnapshot.body.snapshotId),
    "mstyle.snapshot.operation.bind",
    {
      headers: { "X-Actor-Ref": "system:outbox" },
      body: schema({ operationRef: guestOp }),
    },
  );
  await reveal(
    guestSnapshot.body.snapshotId,
    "mstyle.guest.snapshot.private.reveal",
    200,
    guestOp,
    ["individual.passport.fullName"],
  );
  await reveal(
    guestSnapshot.body.snapshotId.replace(/^gps_/, "rps_"),
    "mstyle.resident.snapshot.private.reveal",
    404,
    guestOp,
  );
  await reveal(
    guestSnapshot.body.snapshotId,
    "mstyle.resident.snapshot.private.reveal",
    403,
    guestOp,
  );
  const guestState = await db
    .collection("mstyle_v2_guest_parties")
    .findOne({ guestPartyId: guestId });
  const bookOptions = {
    headers: {
      "X-Actor-Ref": "system:outbox",
      "Idempotency-Key": uid(),
    },
    body: schema({
      snapshotId: guestSnapshot.body.snapshotId,
      participantRole: "booker",
      operationRef: guestOp,
    }),
  };
  const booked = await request(
    "POST",
    "/guest-parties/" + guestId + "/booking-confirmations",
    "mstyle.guest.booking.confirm",
    bookOptions,
  );
  const legacyBook = await request(
    "POST",
    "/guest-parties/" + guestId + "/booking-confirmations",
    "mstyle.guest.booking.confirm",
    {
      ...bookOptions,
      body: {
        ...bookOptions.body,
        snapshotId: guestSnapshot.body.snapshotId.replace(/^gps_/, "snp_"),
      },
    },
  );
  assert.deepEqual(booked.body, legacyBook.body);
  const claimant = await fixture("Локальное присоединение гостя");
  const claimantAuth = await login(claimant.email);
  const claimRoute = "/guest-parties/" + guestId + "/claim";
  const claimOptions = {
    auth: claimantAuth,
    headers: { "Idempotency-Key": uid() },
    body: schema({
      profileId: claimant.profileId,
      expectedGuestPartyRevision: booked.body.revision,
    }),
  };
  await request("POST", claimRoute, "mstyle.guest.claim", {
    ...claimOptions,
    status: 403,
  });
  // Provision only this run's synthetic integration identity with the already verified guest contact.
  const guestContact = await db
    .collection("mstyle_v2_guest_contacts")
    .findOne({ guestPartyId: guestId, type: "email" });
  await db.collection("mstyle_v2_contacts").updateOne(
    { subject: claimant.subject, type: "email" },
    {
      $set: {
        valueHash: guestContact.valueHash,
        valueEnc: guestContact.valueEnc,
        masked: guestContact.masked,
        verifiedAt: guestContact.verifiedAt,
      },
    },
  );
  const claims = await Promise.all([
    request("POST", claimRoute, "mstyle.guest.claim", claimOptions),
    request("POST", claimRoute, "mstyle.guest.claim", claimOptions),
  ]);
  assert.deepEqual(claims[0].body, claims[1].body);
  assert.equal(claims[0].body.claimedBySubject, claimant.subject);
  pass(
    "G-11: verified contact ownership required; concurrent claim commits once",
  );
  pass(
    "Formats: G-02 contactType and gps_ snapshot binding/read/confirmation; full guest booking confirmation",
  );

  // Capture the original legacy records; recovery must append correct events only.
  const events = db.collection("mstyle_v2_change_events");
  const latest = await events.find().sort({ sequence: -1 }).limit(1).next();
  const oldEvent = {
    eventId: Ids.event(),
    sequence: latest.sequence + 1,
    type: "identity_contact.updated",
    subject: person.subject,
    occurredAt: "2026-09-01T00:00:00.000Z",
    aggregate: { type: "identity_contact", id: Ids.contact(), revision: 99 },
    payload: {},
  };
  await events.insertOne(oldEvent);
  const oldStored = await events.findOne({ eventId: oldEvent.eventId });
  await Promise.all(
    [1, 2].map(() =>
      request("GET", "/changes?limit=100", "mstyle.integration.reconcile", {
        headers: { "X-Actor-Ref": "system:reconcile" },
      }),
    ),
  );
  let after = "",
    pages = 0,
    lastSequence = 0;
  const feed = [];
  do {
    const page = await request(
      "GET",
      "/changes?limit=100" +
        (after ? "&after=" + encodeURIComponent(after) : ""),
      "mstyle.integration.reconcile",
      { headers: { "X-Actor-Ref": "system:reconcile" } },
    );
    for (const item of page.body.items) {
      assert.ok(item.sequence > lastSequence);
      lastSequence = item.sequence;
      assert.notEqual(item.type, "identity_contact.updated");
      feed.push(item);
    }
    after = page.body.nextCursor;
    if (!page.body.hasMore) break;
    assert.ok(++pages < 100, "Event feed did not finish");
  } while (true);
  const correction = await events.findOne({ repairsEventId: oldEvent.eventId });
  const personIdentity = await db
    .collection("mstyle_v2_identities")
    .findOne({ subject: person.subject });
  assert.ok(correction);
  assert.equal(correction.type, "identity.updated");
  assert.deepEqual(correction.aggregate, {
    type: "identity",
    id: person.subject,
    revision: personIdentity.revision,
  });
  assert.ok(correction.sequence > oldEvent.sequence);
  assert.ok(correction.occurredAt > oldEvent.occurredAt);
  assert.ok(feed.some((row) => row.eventId === correction.eventId));
  assert.deepEqual(
    await events.findOne({ eventId: oldEvent.eventId }),
    oldStored,
  );
  await request(
    "GET",
    "/changes?after=" + encodeURIComponent(after),
    "mstyle.integration.reconcile",
    { headers: { "X-Actor-Ref": "system:reconcile" } },
  );
  assert.equal(
    await events.countDocuments({ repairsEventId: oldEvent.eventId }),
    1,
  );
  fixtures.repairedEventId = oldEvent.eventId;
  fixtures.formatReplay = {
    bindingKey: bindRequest.idempotencyKey,
    bindingBody: bindRequest.request,
    bindingResponse: bindRequest.response,
    cursor: after,
    snapshotHash: crypto
      .createHash("sha256")
      .update(JSON.stringify(storedSnapshot))
      .digest("hex"),
    oldEventHash: crypto
      .createHash("sha256")
      .update(JSON.stringify(oldStored))
      .digest("hex"),
  };
  pass(
    "Formats: R-03 pagination, real Identity revisions, concurrent append-only legacy recovery and deduplication",
  );
  fs.writeFileSync(
    path.join(stateDir, "format-events.json"),
    JSON.stringify(feed, null, 2),
  );
};
