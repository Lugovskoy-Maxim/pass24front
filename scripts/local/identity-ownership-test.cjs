"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const { root, stateDir } = require("./config.cjs");
const { ObjectId } = require(path.join(root, "backend/node_modules/mongodb"));
const bcrypt = require(path.join(root, "backend/node_modules/bcryptjs"));
const { Ids } = require(
  path.join(root, "backend/dist/integrations/mstyle-v2/mstyle-v2.ids"),
);

// Invoked only by the isolated local acceptance harness. Native mutations below are synthetic fixtures.
module.exports = async ({
  db,
  nativeDb,
  request,
  fixture,
  login,
  schema,
  pass,
}) => {
  assert.equal(db.databaseName, "pass_local");
  assert.equal(nativeDb.databaseName, "pass_local_auth");
  const users = nativeDb.collection("users"),
    identities = db.collection("mstyle_v2_identities");
  const uid = () => crypto.randomUUID();
  const digest = (value) =>
    crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const password = crypto.randomBytes(24).toString("base64url");
  const nextPassword = crypto.randomBytes(24).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 8);
  let context = {
    ipAddress: "192.0.2.31",
    userAgent: "Local identity ownership acceptance",
    locale: "ru-RU",
  };
  const authScope = "mstyle.resident.authenticate";
  const nativeFixture = async (extra = {}) => {
    const suffix = uid().replaceAll("-", "");
    const user = {
      _id: new ObjectId(),
      email: suffix + "@pass24.local",
      username: "owner_" + suffix,
      fullName: "Исходное имя Pass",
      firstName: "Исходное",
      lastName: "Имя",
      displayName: "Имя Pass",
      phone: "+7999" + String(crypto.randomInt(1000000, 9999999)),
      emailVerified: false,
      password: passwordHash,
      authVersion: 2,
      role: "tenant",
      isActive: true,
      isBlocked: false,
      invitePending: false,
      identityStatus: "active",
      profileType: "company",
      legalForm: "ooo",
      company: "Исходная компания",
      companyShortName: "Исходная компания",
      employeeLimit: 8,
      privateDataComplete: true,
      privateDataRevision: 91,
      ...extra,
    };
    await users.insertOne(user);
    return user;
  };
  const passwordLogin = (value, code = password, status = 200, key = uid()) =>
    request("POST", "/auth/residents/password:verify", authScope, {
      status,
      headers: { "Idempotency-Key": key },
      body: schema({ login: value, password: code, context }),
    });
  const start = (type, value, status = 202) =>
    request("POST", "/auth/residents/code-challenges", authScope, {
      status,
      body: schema({
        identifier: { type, value },
        channel: type === "email" ? "email" : "sms",
        context,
      }),
    });
  const verify = (challenge, status = 200, key = uid()) =>
    request(
      "POST",
      "/auth/residents/code-challenges/" +
        challenge.body.challengeId +
        "/verify",
      authScope,
      {
        status,
        headers: { "Idempotency-Key": key },
        body: schema({ code: "1234", context }),
      },
    );
  const identityFor = (user) =>
    identities.findOne({ userId: String(user._id) });
  const nativeDigest = async (user) =>
    digest(await users.findOne({ _id: user._id }));
  const user = await nativeFixture();
  let baseline = await nativeDigest(user);
  const initial = await Promise.all([
    passwordLogin(user.username),
    passwordLogin(user.username),
  ]);
  assert.equal(initial[0].body.subject, initial[1].body.subject);
  const subject = initial[0].body.subject;
  assert.equal(
    await identities.countDocuments({ userId: String(user._id) }),
    1,
  );
  assert.equal(
    await db
      .collection("mstyle_v2_memberships")
      .countDocuments({ subject, role: "owner" }),
    1,
  );
  assert.equal(
    await nativeDigest(user),
    baseline,
    "First import must not write User",
  );
  const membership = await db
    .collection("mstyle_v2_memberships")
    .findOne({ subject, role: "owner" });
  const profileId = membership.profileId,
    profileRoute = "/resident-profiles/" + profileId;
  const imported = await db
    .collection("mstyle_v2_profiles")
    .findOne({ profileId });
  assert.equal(imported.privateDataRevision, null);
  assert.equal(imported.privateDataComplete, false);
  const contacts = await db
    .collection("mstyle_v2_contacts")
    .find({ subject })
    .toArray();
  assert.equal(contacts.length, 2);
  assert.ok(
    contacts.every((row) => row.verifiedAt === null),
    "Import cannot confirm ownership of unverified native contacts",
  );
  let auth = initial[0].body;
  const resident = (method, route, scope, options = {}) =>
    request(method, route, scope, { auth, ...options });
  await resident(
    "PATCH",
    "/residents/" + subject + "/identity",
    "mstyle.resident.identity.write",
    {
      headers: {
        "If-Match": '"identity-' + (await identityFor(user)).revision + '"',
      },
      body: schema({
        displayName: "Имя Мстиль",
        name: { firstName: "Мстиль", lastName: "Изменённое" },
      }),
    },
  );
  await resident(
    "PATCH",
    profileRoute + "/private-data",
    "mstyle.resident.private.write",
    {
      purpose: "account_profile_edit",
      headers: { "If-Match": '"private-0"' },
      body: schema({
        privateData: {
          profileType: "company",
          legalForm: "ooo",
          data: {
            company: {
              fullName: 'ООО "Анкета Мстиль"',
              inn: "0000000000",
              ogrn: "0000000000000",
              legalAddress: "Локальный адрес",
            },
          },
        },
      }),
    },
  );
  // Profile metadata has no direct editing route; emulate a previously saved Mstyle profile.
  await db.collection("mstyle_v2_profiles").updateOne(
    { profileId },
    {
      $set: {
        label: "Профиль Мстиль",
        companyShortName: "Мстиль",
        "memberPolicy.employeeLimit": 3,
      },
      $inc: { revision: 1 },
    },
  );
  const changedProfile = digest(
    await db.collection("mstyle_v2_profiles").findOne({ profileId }),
  );
  const privateDigest = digest(
    await db
      .collection("mstyle_v2_private_data")
      .findOne({ partyId: profileId, partyType: "resident_profile" }),
  );
  const newEmail = uid() + "@pass24.local",
    newPhone = "+7999" + String(crypto.randomInt(1000000, 9999999));
  const stale = await start("email", user.email);
  for (const [type, value] of [
    ["email", newEmail],
    ["phone", newPhone],
  ]) {
    const challenge = await resident(
      "POST",
      "/residents/" + subject + "/contacts/challenges",
      "mstyle.resident.contact.write",
      { status: 201, body: schema({ contactType: type, value }) },
    );
    await resident(
      "POST",
      "/residents/" +
        subject +
        "/contacts/challenges/" +
        challenge.body.challengeId +
        "/verify",
      "mstyle.resident.contact.write",
      { body: schema({ code: "1234" }) },
    );
  }
  await verify(stale, 401);
  await db
    .collection("mstyle_v2_challenges")
    .updateOne(
      { challengeId: stale.body.challengeId },
      { $set: { resendAfter: new Date(0) } },
    );
  await request(
    "POST",
    "/auth/residents/code-challenges/" + stale.body.challengeId + "/resend",
    authScope,
    { status: 401, body: schema({}) },
  );
  for (const [type, oldValue, newValue] of [
    ["email", user.email, newEmail],
    ["phone", user.phone, newPhone],
  ]) {
    const old = await start(type, oldValue);
    assert.equal(
      (
        await db
          .collection("mstyle_v2_challenges")
          .findOne({ challengeId: old.body.challengeId })
      ).isDummy,
      true,
    );
    await verify(old, 401);
    auth = (await verify(await start(type, newValue))).body;
    assert.equal(auth.subject, subject);
  }
  auth = (await passwordLogin(newEmail)).body;
  await passwordLogin(user.username);
  await passwordLogin(user.email, password, 401);
  const identity = await identityFor(user);
  assert.equal(identity.displayName, "Имя Мстиль");
  assert.equal(identity.name.firstName, "Мстиль");
  assert.equal(identity.email, newEmail);
  assert.equal(identity.phone, newPhone);
  assert.equal(
    digest(await db.collection("mstyle_v2_profiles").findOne({ profileId })),
    changedProfile,
  );
  assert.equal(
    await nativeDigest(user),
    baseline,
    "Mstyle changes and repeated logins must not write User",
  );
  pass(
    "Identity ownership: concurrent initial import, unchanged User, retained name/profile/private data, current email/phone and stale challenge rejection",
  );

  context = { ...context, ipAddress: "192.0.2.32" };
  const beforeBlock = await start("email", newEmail),
    verifyKey = uid();
  auth = (await verify(beforeBlock, 200, verifyKey)).body;
  const passwordKey = uid();
  await passwordLogin(newEmail, password, 200, passwordKey);
  await users.updateOne(
    { _id: user._id },
    { $set: { isBlocked: true }, $inc: { authVersion: 1 } },
  );
  baseline = await nativeDigest(user);
  await resident("GET", profileRoute, "mstyle.resident.profile.read", {
    status: 401,
  });
  await verify(beforeBlock, 401, verifyKey);
  await passwordLogin(newEmail, password, 401, passwordKey);
  await verify(await start("email", newEmail), 401);
  await passwordLogin(user.username, password, 401);
  assert.equal(await nativeDigest(user), baseline);
  const blockedVersion = (await identityFor(user)).authVersion;
  await users.updateOne({ _id: user._id }, { $set: { isBlocked: false } });
  auth = (await passwordLogin(newEmail)).body;
  assert.ok(auth.authVersion > blockedVersion);
  await verify(beforeBlock, 401, verifyKey);
  const beforePassword = await start("email", newEmail);
  // Also detect a native password replacement that did not increment User.authVersion.
  await users.updateOne(
    { _id: user._id },
    { $set: { password: await bcrypt.hash(nextPassword, 8) } },
  );
  await resident("GET", profileRoute, "mstyle.resident.profile.read", {
    status: 401,
  });
  await verify(beforePassword, 401);
  await passwordLogin(newEmail, password, 401);
  auth = (await passwordLogin(newPhone, nextPassword)).body;
  await resident("GET", profileRoute, "mstyle.resident.profile.read");
  const highest = auth.authVersion;
  await users.updateOne({ _id: user._id }, { $set: { authVersion: 1 } });
  auth = (await passwordLogin(newEmail, nextPassword)).body;
  assert.ok(
    auth.authVersion > highest,
    "Integration authVersion must never decrease",
  );
  const beforeMigration = auth.authVersion;
  baseline = await nativeDigest(user);
  await identities.updateOne(
    { subject },
    {
      $unset: {
        userSecurityStamp: "",
        userSecurityStatus: "",
        userRestrictionPreviousStatus: "",
      },
    },
  );
  auth = (await passwordLogin(newPhone, nextPassword)).body;
  assert.equal(auth.authVersion, beforeMigration + 1);
  assert.equal(
    await nativeDigest(user),
    baseline,
    "Existing projection migration must not write User",
  );
  assert.equal((await identityFor(user)).displayName, "Имя Мстиль");
  assert.equal(
    digest(await db.collection("mstyle_v2_profiles").findOne({ profileId })),
    changedProfile,
  );
  pass(
    "User security: blocked account, invalidated step-up and cached A-02/A-06, unblock, changed native password and monotonic authVersion",
  );

  context = { ...context, ipAddress: "192.0.2.33" };
  const parent = await nativeFixture({
    emailVerified: true,
    passSubject: Ids.subject(),
    company: "Владелец",
    companyShortName: "Владелец",
  });
  const child = await nativeFixture({
    role: "tenant_employee",
    parentTenantId: parent._id,
    company: "Устаревшая копия сотрудника",
  });
  const parentDigest = await nativeDigest(parent),
    childDigest = await nativeDigest(child);
  const employeeAuth = (await passwordLogin(child.username)).body;
  const parentIdentity = await identityFor(parent),
    childIdentity = await identityFor(child);
  assert.equal(parentIdentity.subject, parent.passSubject);
  const childMembership = await db
    .collection("mstyle_v2_memberships")
    .findOne({ subject: childIdentity.subject });
  assert.equal(childMembership.role, "employee");
  assert.equal(
    (
      await db
        .collection("mstyle_v2_profiles")
        .findOne({ profileId: childMembership.profileId })
    ).companyShortName,
    "Владелец",
  );
  assert.equal(await nativeDigest(parent), parentDigest);
  assert.equal(await nativeDigest(child), childDigest);
  assert.ok(
    (
      await db
        .collection("mstyle_v2_contacts")
        .findOne({ subject: parentIdentity.subject, type: "email" })
    ).verifiedAt,
  );
  await users.updateOne(
    { _id: child._id },
    { $set: { isActive: false }, $inc: { authVersion: 1 } },
  );
  await request(
    "GET",
    "/resident-profiles/" + childMembership.profileId,
    "mstyle.resident.profile.read",
    { auth: employeeAuth, status: 401 },
  );
  await verify(await start("email", child.email), 401);
  await users.updateOne(
    { _id: child._id },
    { $set: { isActive: true }, $inc: { authVersion: 1 } },
  );
  await passwordLogin(child.username);
  await users.updateOne(
    { _id: child._id },
    { $set: { identityStatus: "deleted" } },
  );
  await passwordLogin(child.username, password, 401);
  const orphan = await nativeFixture({
    parentTenantId: new ObjectId(),
    role: "tenant_employee",
  });
  await passwordLogin(orphan.username, password, 409);
  assert.equal(
    await identityFor(orphan),
    null,
    "Import rollback must not leave an identity without its owner",
  );
  pass(
    "Native employee import: owner data, preserved native documents, disabled/deleted access and atomic rollback on missing parent",
  );

  context = { ...context, ipAddress: "192.0.2.34" };
  const target = await fixture("Совпадение с User"),
    targetAuth = (await verify(await start("email", target.email))).body;
  const unimported = await nativeFixture();
  const targetProfile = await db
    .collection("mstyle_v2_profiles")
    .findOne({ profileId: target.profileId });
  await request(
    "POST",
    "/resident-profiles/" + target.profileId + "/memberships",
    "mstyle.resident.members.write",
    {
      auth: targetAuth,
      status: 409,
      purpose: "membership_invitation",
      headers: {
        "If-Match": '"memberships-' + targetProfile.membershipSetRevision + '"',
      },
      body: schema({
        expectedRevisions: {
          profile: targetProfile.revision,
          membershipSet: targetProfile.membershipSetRevision,
        },
        identity: {
          invitation: { displayName: "Сотрудник", email: unimported.email },
        },
      }),
    },
  );
  assert.equal(await identities.countDocuments({ email: unimported.email }), 0);
  await passwordLogin(unimported.username);
  const collision = await nativeFixture({ email: target.email });
  await passwordLogin(collision.username, password, 409);
  assert.equal(await identityFor(collision), null);
  const ambiguous = await nativeFixture({ passSubject: Ids.subject() });
  await passwordLogin(ambiguous.username);
  await users.updateOne(
    { _id: ambiguous._id },
    { $set: { passSubject: target.subject } },
  );
  await passwordLogin(ambiguous.username, password, 409);
  // Restore intentionally conflicting test data for subsequent read-only preflight runs.
  await users.updateOne(
    { _id: ambiguous._id },
    { $set: { passSubject: ambiguous.passSubject } },
  );
  assert.equal(
    (await identities.findOne({ subject: target.subject })).userId,
    undefined,
  );
  pass(
    "Identity links: explicit native subject, unimported employee collision, no contact-based merge and ambiguous link rejection",
  );
  assert.equal(
    digest(
      await db
        .collection("mstyle_v2_private_data")
        .findOne({ partyId: profileId, partyType: "resident_profile" }),
    ),
    privateDigest,
  );
  fs.writeFileSync(
    path.join(stateDir, "ownership-replay.json"),
    JSON.stringify({
      userId: String(user._id),
      subject,
      profileId,
      nativeDigest: await nativeDigest(user),
      profileDigest: changedProfile,
      privateDigest,
      email: newEmail,
      phone: newPhone,
      authVersion: (await identityFor(user)).authVersion,
    }),
  );
};
