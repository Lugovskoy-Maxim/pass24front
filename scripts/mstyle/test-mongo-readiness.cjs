"use strict";
// Uses a fresh loopback-only mongod process. Never connects to an existing database.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const Module = require("node:module");
const root = path.resolve(__dirname, "../..");
const dep = (name) => require(path.join(root, "backend/node_modules", name));
const { MongoClient } = dep("mongodb");
const mongoose = dep("mongoose");
dep("reflect-metadata");
const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
const executable = process.argv.includes("--mongod") && arg("--mongod");
if (!executable || !path.isAbsolute(executable)) {
  throw new Error("Pass an absolute path to mongod with --mongod");
}
const reproduce = process.argv.includes("--reproduce");
const runDir = path.join(
  root,
  ".local/readiness",
  new Date().toISOString().replace(/[:.]/g, "-"),
);
fs.mkdirSync(path.join(runDir, "db"), { recursive: true });
const report = {
  mode: reproduce ? "reproduce" : "regression",
  checks: [],
  errors: [],
};
let mongo, client, connection, backendProcess;
const pass = (name) => {
  report.checks.push(name);
  console.log("PASS " + name);
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}
function schemas(
  file = process.argv.includes("--schema-file")
    ? arg("--schema-file")
    : undefined,
) {
  if (!file)
    return require(
      path.join(root, "backend/dist/integrations/mstyle-v2/mstyle-v2.schemas"),
    );
  const ts = dep("typescript");
  const source = fs.readFileSync(file, "utf8");
  const filename = path.join(root, "backend/schema-probe.cjs");
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
    }).outputText,
    filename,
  );
  return mod.exports;
}
async function main() {
  const port = await freePort();
  const uri = `mongodb://127.0.0.1:${port}/readiness_test?directConnection=true`;
  mongo = spawn(
    executable,
    [
      "--bind_ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--dbpath",
      path.join(runDir, "db"),
      "--logpath",
      path.join(runDir, "mongod.log"),
      "--replSet",
      "readiness-test-rs",
      "--oplogSize",
      "64",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  let startError;
  mongo.once("error", (error) => {
    startError = error;
  });
  for (let n = 0; n < 60; n++) {
    if (startError) throw startError;
    if (mongo.exitCode !== null)
      throw new Error("mongod exited: " + mongo.exitCode);
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 500 });
    try {
      await client.connect();
      break;
    } catch (error) {
      await client.close();
      if (n === 59) throw error;
      await pause(250);
    }
  }
  const db = client.db();
  await db.admin().command({
    replSetInitiate: {
      _id: "readiness-test-rs",
      members: [{ _id: 0, host: `127.0.0.1:${port}` }],
    },
  });
  for (let n = 0; n < 120; n++) {
    if ((await db.admin().command({ hello: 1 })).isWritablePrimary) break;
    if (n === 119) throw new Error("Replica set did not elect a primary");
    await pause(250);
  }
  report.mongoVersion = (await db.admin().command({ buildInfo: 1 })).version;
  console.log("MongoDB " + report.mongoVersion);
  connection = await mongoose
    .createConnection(uri, { autoIndex: false, autoCreate: false })
    .asPromise();
  const { MSTYLE_MODELS } = schemas();
  for (const { name, schema } of MSTYLE_MODELS) {
    const model = connection.model(name, schema);
    try {
      await model.createCollection();
      await model.createIndexes();
    } catch (error) {
      report.errors.push({
        model: name,
        code: error.code,
        message: error.message,
      });
    }
  }
  if (reproduce) {
    assert.ok(report.errors.length, "Expected to reproduce an index failure");
    console.log(JSON.stringify(report.errors, null, 2));
    pass("original index failure reproduced on an empty replica set");
    if (process.argv.includes("--http")) await httpChecks(port, true);
    return;
  }
  assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
  pass("all integration collections and indexes are created");
  const { MstyleReadinessService } = require(
    path.join(root, "backend/dist/integrations/mstyle-v2/mstyle-v2.readiness"),
  );
  const service = () =>
    new MstyleReadinessService(connection, { assertReady() {} });
  const native = db.collection("users");
  await native.insertOne({ _id: "native-sentinel", name: "Исходная запись" });
  await native.createIndex({ name: 1 }, { name: "native_custom_index" });
  const nativeBefore = {
    rows: await native.find().toArray(),
    indexes: await native.indexes(),
  };
  await service().assertReady();
  pass("integration readiness succeeds");
  if (process.argv.includes("--legacy-schema-file")) {
    const old = await mongoose
      .createConnection(uri, {
        dbName: "readiness_upgrade",
        autoIndex: false,
        autoCreate: false,
      })
      .asPromise();
    try {
      await old.db.collection("mstyle_v2_snapshot_bindings").insertMany([
        {
          bindingId: "legacy-a",
          snapshotId: "legacy-snapshot-a",
          operationRef: "old-a",
        },
        {
          bindingId: "legacy-b",
          snapshotId: "legacy-snapshot-b",
          operationRef: "old-b",
        },
      ]);
      for (const { name, schema } of schemas(arg("--legacy-schema-file"))
        .MSTYLE_MODELS) {
        const model = old.model(name, schema);
        await model.createCollection();
        try {
          await model.createIndexes();
        } catch {
          /* Original startup fails; indexes created before failure remain. */
        }
      }
      const rows = await old.db
        .collection("mstyle_v2_snapshot_bindings")
        .find()
        .toArray();
      for (const { name, schema } of MSTYLE_MODELS) {
        old.deleteModel(name);
        old.model(name, schema);
      }
      await new MstyleReadinessService(old, { assertReady() {} }).assertReady();
      await new MstyleReadinessService(old, { assertReady() {} }).assertReady();
      assert.deepEqual(
        await old.db.collection("mstyle_v2_snapshot_bindings").find().toArray(),
        rows,
      );
      pass(
        "partially initialized handed-off database upgrades without changing legacy bindings",
      );
    } finally {
      await old.close();
    }
  }

  const bindings = db.collection("mstyle_v2_snapshot_bindings");
  await bindings.insertMany([
    {
      bindingId: "legacy-1",
      snapshotId: "legacy-snapshot-1",
      operationRef: "old-operation-1",
    },
    {
      bindingId: "legacy-2",
      snapshotId: "legacy-snapshot-2",
      operationRef: "old-operation-2",
    },
  ]);
  const ref = {
    sourceSystem: "mstyle",
    environment: "local",
    operationType: "booking",
    operationId: "operation-1",
  };
  await bindings.insertOne({
    bindingId: "new-1",
    snapshotId: "snapshot-1",
    operationRef: ref,
  });
  await assert.rejects(
    bindings.insertOne({
      bindingId: "new-2",
      snapshotId: "snapshot-2",
      operationRef: ref,
    }),
    { code: 11000 },
  );
  await assert.rejects(
    bindings.insertOne({
      bindingId: "new-3",
      snapshotId: "snapshot-1",
      operationRef: { ...ref, operationId: "operation-2" },
    }),
    { code: 11000 },
  );
  await service().assertReady();
  pass("legacy string bindings survive; structured bindings remain one-to-one");
  const { databaseChecks } = require("./preflight.cjs");
  let checks = await databaseChecks(db);
  assert.ok(
    checks.every((check) => check.ok),
    JSON.stringify(checks),
  );
  assert.equal(
    checks.find((c) => c.name === "Snapshot binding operation reference format")
      .legacyStringReferences,
    2,
  );
  pass(
    "preflight excludes legacy null groups and reports legacy references separately",
  );

  const deletions = db.collection("mstyle_v2_deletion_requests");
  await deletions.insertOne({
    deletionRequestId: "delete-1",
    profileId: "profile-1",
    status: "pending",
  });
  await assert.rejects(
    deletions.insertOne({
      deletionRequestId: "delete-2",
      profileId: "profile-1",
      status: "pending",
      completedAt: null,
    }),
    { code: 11000 },
  );
  await deletions.updateOne(
    { deletionRequestId: "delete-1" },
    { $set: { status: "blocked" } },
  );
  await assert.rejects(
    deletions.insertOne({
      deletionRequestId: "delete-blocked",
      profileId: "profile-1",
      status: "blocked",
    }),
    { code: 11000 },
  );
  await deletions.updateOne(
    { deletionRequestId: "delete-1" },
    { $set: { status: "rejected" } },
  );
  await deletions.insertOne({
    deletionRequestId: "delete-3",
    profileId: "profile-1",
    status: "pending",
    completedAt: null,
  });
  await deletions.updateOne(
    { deletionRequestId: "delete-3" },
    { $set: { status: "completed", completedAt: new Date().toISOString() } },
  );
  await deletions.insertOne({
    deletionRequestId: "delete-4",
    profileId: "profile-1",
    status: "pending",
  });
  pass(
    "pending/blocked uniqueness; rejected without completedAt and completed history permit new requests",
  );

  const identities = db.collection("mstyle_v2_identities");
  const userIndex = (await identities.indexes()).find((i) => i.key.userId);
  await identities.dropIndex(userIndex.name);
  await identities.createIndex({ userId: 1 });
  await service().assertReady();
  assert.ok((await identities.indexes()).find((i) => i.key.userId)?.unique);
  await service().assertReady();
  pass("legacy non-unique index upgrades; repeated readiness is idempotent");

  await bindings.dropIndex("one_snapshot_per_operation");
  await bindings.insertOne({
    bindingId: "conflict-1",
    snapshotId: "conflict-snapshot",
    operationRef: ref,
  });
  const before = await bindings.find().toArray();
  checks = await databaseChecks(db);
  assert.equal(
    checks.find((c) => c.name === "One snapshot per operation").duplicateGroups,
    1,
  );
  await assert.rejects(service().assertReady(), {
    problemCode: "UPSTREAM_UNAVAILABLE",
  });
  assert.deepEqual(await bindings.find().toArray(), before);
  assert.deepEqual(
    { rows: await native.find().toArray(), indexes: await native.indexes() },
    nativeBefore,
  );
  pass(
    "real duplicates block readiness without deleting bindings or changing native data/indexes",
  );
  if (process.argv.includes("--http")) await httpChecks(port, false);
}
async function child(args, options, logName) {
  const output = fs.openSync(path.join(runDir, logName), "w");
  try {
    return await new Promise((resolve, reject) => {
      const proc = spawn(process.execPath, args, {
        windowsHide: true,
        ...options,
        stdio: ["ignore", output, output],
      });
      proc.once("error", reject);
      proc.once("exit", (code) => resolve(code));
    });
  } finally {
    fs.closeSync(output);
  }
}
async function httpChecks(mongoPort, failureExpected) {
  const configFile = path.join(root, "scripts/local/config.cjs");
  const cfg = require(configFile);
  const httpPort = await freePort();
  const baseUrl = `http://127.0.0.1:${httpPort}`;
  const env = {
    ...cfg.environment("backend", cfg.settings(true)),
    PORT: String(httpPort),
    MONGODB_URI: `mongodb://127.0.0.1:${mongoPort}/pass_local?directConnection=true`,
    MONGODB_AUTH_URI: `mongodb://127.0.0.1:${mongoPort}/pass_local_auth?directConnection=true`,
    MSTYLE_PUBLIC_BASE_URL: baseUrl,
    PUBLIC_API_URL: baseUrl,
  };
  const guardFile = path.join(runDir, "network-guard.cjs");
  fs.writeFileSync(
    guardFile,
    fs
      .readFileSync(path.join(root, "scripts/local/network-guard.cjs"), "utf8")
      .replace("[3300, 3400, 37017]", JSON.stringify([httpPort, mongoPort])),
  );
  const backend = process.argv.includes("--backend-dir")
    ? path.resolve(arg("--backend-dir"))
    : path.join(root, "backend");
  const log = fs.openSync(path.join(runDir, "backend.log"), "w");
  try {
    backendProcess = spawn(
      process.execPath,
      ["--require", guardFile, path.join(backend, "dist/main.js")],
      { cwd: backend, env, windowsHide: true, stdio: ["ignore", log, log] },
    );
  } finally {
    fs.closeSync(log);
  }
  let live = false;
  for (let n = 0; n < 120; n++) {
    if (backendProcess.exitCode !== null)
      throw new Error("Backend exited; see backend.log");
    try {
      live =
        (
          await fetch(baseUrl + "/api/docs", {
            signal: AbortSignal.timeout(1000),
          })
        ).status === 200;
    } catch {}
    if (live) break;
    await pause(250);
  }
  assert.ok(live, "Native HTTP server must start");
  pass("native HTTP server starts with the integration enabled");
  if (failureExpected) {
    const response = await fetch(baseUrl + "/api/oauth2/token", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials&client_id=mstyle-backend-local",
    });
    report.oauthFailure = {
      status: response.status,
      retryAfter: response.headers.get("retry-after"),
      body: await response.json(),
    };
    assert.equal(response.status, 503);
    assert.equal(report.oauthFailure.body.code, "UPSTREAM_UNAVAILABLE");
    pass("original token endpoint returns HTTP 503 UPSTREAM_UNAVAILABLE");
    return;
  }
  for (const valid of [true, false]) {
    const output = `preflight-${valid ? "configured" : "missing-consents"}.json`;
    const status = await child(
      [path.join(root, "scripts/mstyle/preflight.cjs")],
      {
        cwd: backend,
        env: {
          ...env,
          ...(valid ? {} : { MSTYLE_CONSENT_DOCUMENTS_JSON: "[]" }),
        },
      },
      output,
    );
    assert.equal(status, 1); // Production preflight deliberately rejects disabled OTP delivery in local mode.
    const result = JSON.parse(
      fs.readFileSync(path.join(runDir, output), "utf8"),
    );
    assert.equal(result.readOnly, true);
    assert.equal(
      result.checks.find(
        (c) => c.name === "Current consent documents and evidence codes",
      ).ok,
      valid,
    );
    assert.deepEqual(
      result.checks.filter((c) => !c.ok).map((c) => c.name),
      [
        "Real OTP dispatch is enabled",
        ...(valid ? [] : ["Current consent documents and evidence codes"]),
      ],
    );
  }
  pass(
    "preflight diagnoses missing consent settings separately from OAuth readiness",
  );
  const harness = path.join(runDir, "acceptance.cjs");
  fs.writeFileSync(
    harness,
    `
    const cfg = require(${JSON.stringify(configFile)});
    cfg.ports = { ...cfg.ports, mongo: ${mongoPort}, backend: ${httpPort} };
    cfg.urls = { ...cfg.urls, backend: ${JSON.stringify(baseUrl)} };
    cfg.stateDir = ${JSON.stringify(runDir)};
    const test = require(${JSON.stringify(path.join(root, "scripts/local/stage1-test.cjs"))});
    test.main(${JSON.stringify({ backend: baseUrl, mongo: mongoPort, replicaSet: "readiness-test-rs" })})
      .catch(e => { console.error(e.stack); process.exitCode = 1; }).finally(() => test.close());
  `,
  );
  // Keep fixture keys available only inside this isolated test run.
  fs.mkdirSync(path.join(runDir, "keys"), { recursive: true });
  for (const name of ["client-private.pem", "client-public.pem"])
    fs.copyFileSync(
      path.join(root, ".local/keys", name),
      path.join(runDir, "keys", name),
    );
  assert.equal(
    await child(
      ["--require", guardFile, harness],
      { cwd: root, env },
      "acceptance.log",
    ),
    0,
    "HTTP suite failed; see acceptance.log",
  );
  const result = JSON.parse(
    fs.readFileSync(path.join(runDir, "stage1-result.json"), "utf8"),
  );
  report.http = { groups: result.checks.length, requests: result.httpRequests };
  pass(
    `HTTP acceptance: ${report.http.groups} groups, ${report.http.requests} requests`,
  );
}
main()
  .catch((error) => {
    report.failure = error.stack;
    console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (backendProcess && backendProcess.exitCode === null) {
      backendProcess.kill();
      await Promise.race([
        new Promise((resolve) => backendProcess.once("exit", resolve)),
        pause(5000),
      ]);
    }
    if (connection) await connection.close();
    if (client) {
      try {
        await client.db("admin").command({ shutdown: 1 });
      } catch {}
      await client.close();
    }
    if (mongo && mongo.exitCode === null) {
      await Promise.race([
        new Promise((resolve) => mongo.once("exit", resolve)),
        pause(5000),
      ]);
      if (mongo.exitCode === null) mongo.kill();
    }
    fs.writeFileSync(
      path.join(runDir, "result.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log("Report: " + path.join(runDir, "result.json"));
  });
