// MongoDB initialization script for PASS24
// This file is executed automatically when the container starts for the first time.

print("🔧 Initializing PASS24 MongoDB databases...");

const appDbName = 'pass24';
const authDbName = 'pass24_auth';
const appDb = db.getSiblingDB(appDbName);
const authDb = db.getSiblingDB(authDbName);

// Operational data
appDb.createCollection('properties');
appDb.createCollection('offices');
appDb.createCollection('passes');
appDb.createCollection('audit_logs');
appDb.createCollection('app_settings');

// Identity / auth data
authDb.createCollection('users');
authDb.createCollection('registration_pending');

// Auth indexes
authDb.users.createIndex({ username: 1 }, { unique: true, sparse: true });
authDb.users.createIndex({ email: 1 }, { unique: true, sparse: true });
authDb.users.createIndex({ phone: 1 }, { unique: true, sparse: true });
authDb.users.createIndex({ properties: 1 });
authDb.users.createIndex({ role: 1, isActive: 1 });
authDb.users.createIndex({ parentTenantId: 1 });
authDb.registration_pending.createIndex({ email: 1 }, { unique: true, sparse: true });
authDb.registration_pending.createIndex({ phone: 1 }, { unique: true, sparse: true });
authDb.registration_pending.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// App indexes
appDb.properties.createIndex({ code: 1 }, { unique: true, sparse: true });
appDb.properties.createIndex({ isActive: 1 });
appDb.offices.createIndex({ property: 1, number: 1 }, { unique: true });
appDb.offices.createIndex({ tenantId: 1 });
appDb.offices.createIndex({ property: 1 });
appDb.passes.createIndex({ passNumber: 1 }, { unique: true });
appDb.passes.createIndex({ status: 1, visitDate: -1 });
appDb.passes.createIndex({ vehiclePlate: 1 });
appDb.passes.createIndex({ property: 1, visitDate: -1 });

print(`✅ Database '${appDbName}' initialized (operational data).`);
print(`✅ Database '${authDbName}' initialized (auth / identity).`);
print("Connect: mongodb://localhost:27017/pass24 (app), mongodb://localhost:27017/pass24_auth (auth)");
