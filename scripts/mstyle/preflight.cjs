"use strict";
// Read-only deployment checks. Credentials are read from the process environment.
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const { MongoClient } = require(
  path.join(root, "backend/node_modules/mongodb"),
);
const local = process.argv.includes("--local");
const uri = local
  ? "mongodb://127.0.0.1:37017/pass_local"
  : process.env.MONGODB_URI;
if (!uri) {
  console.error(
    "MONGODB_URI is required; pass credentials through the environment.",
  );
  process.exit(2);
}
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
async function duplicates(db, collection, key, match = {}) {
  const rows = await db
    .collection(collection)
    .aggregate([
      { $match: match },
      { $group: { _id: key, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: "groups" },
    ])
    .toArray();
  return rows[0]?.groups || 0;
}
async function main() {
  await client.connect();
  const db = client.db();
  const hello = await db.admin().command({ hello: 1 });
  const checks = [
    {
      name: "MongoDB supports transactions",
      ok: !!hello.setName || hello.msg === "isdbgrid",
    },
  ];
  const pendingDispatches = await db
    .collection("mstyle_v2_idempotency")
    .countDocuments({
      statusCode: 0,
      createdAt: { $lt: new Date(Date.now() - 300000) },
    });
  checks.push({
    name: "No interrupted dispatches older than five minutes",
    ok: pendingDispatches === 0,
    pendingDispatches,
  });
  for (const [name, collection, key, match] of [
    [
      "One snapshot per operation",
      "mstyle_v2_snapshot_bindings",
      {
        sourceSystem: "$operationRef.sourceSystem",
        environment: "$operationRef.environment",
        operationType: "$operationRef.operationType",
        operationId: "$operationRef.operationId",
      },
      {},
    ],
    [
      "One operation per snapshot",
      "mstyle_v2_snapshot_bindings",
      "$snapshotId",
      {},
    ],
    [
      "One identity per native User",
      "mstyle_v2_identities",
      "$userId",
      { userId: { $type: "string" } },
    ],
    [
      "Unique guest bearer hashes",
      "mstyle_v2_guest_parties",
      "$guestFlowAccessTokenHash",
      { guestFlowAccessTokenHash: { $type: "string" } },
    ],
    [
      "Unique repaired events",
      "mstyle_v2_change_events",
      "$repairsEventId",
      { repairsEventId: { $type: "string" } },
    ],
  ]) {
    const duplicateGroups = await duplicates(db, collection, key, match);
    checks.push({ name, ok: duplicateGroups === 0, duplicateGroups });
  }
  if (!local) {
    require(path.join(root, "backend/node_modules/reflect-metadata"));
    const { ConfigService } = require(
      path.join(root, "backend/node_modules/@nestjs/config"),
    );
    const { MstyleV2Config } = require(
      path.join(root, "backend/dist/integrations/mstyle-v2/mstyle-v2.config"),
    );
    const { MstyleConsentService } = require(
      path.join(
        root,
        "backend/dist/integrations/mstyle-v2/mstyle-v2.consent.service",
      ),
    );
    const config = new ConfigService(process.env);
    const cfg = new MstyleV2Config(config);
    let configured = true;
    try {
      cfg.assertReady();
    } catch {
      configured = false;
    }
    checks.push({
      name: "Integration configuration and client public keys",
      ok: configured,
    });
    checks.push({
      name: "Real OTP dispatch is enabled",
      ok: cfg.dispatchEnabled() && cfg.environment() !== "local",
    });
    let documents = true;
    try {
      new MstyleConsentService(config).definitions();
    } catch {
      documents = false;
    }
    checks.push({
      name: "Current consent documents and evidence codes",
      ok: documents,
    });
  }
  console.log(JSON.stringify({ readOnly: true, checks }, null, 2));
  if (checks.some((row) => !row.ok)) process.exitCode = 1;
}
main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        error: error.name,
        code: error.code || "preflight_failed",
      }),
    );
    process.exitCode = 1;
  })
  .finally(() => client.close());
