// MongoDB initialization script for PASS24
// This file is executed automatically when the container starts for the first time.

print("🔧 Initializing PASS24 MongoDB databases...");

const appDbName = 'pass24';
const authDbName = 'pass24_auth';
const appDb = db.getSiblingDB(appDbName);
const authDb = db.getSiblingDB(authDbName);

// Operational data (passes, offices, etc.)
appDb.createCollection('properties');
appDb.createCollection('passes');
appDb.createCollection('pass_requests');
appDb.createCollection('access_events');
appDb.createCollection('vehicles');
appDb.createCollection('authorizations');
appDb.createCollection('audit_logs');
appDb.createCollection('app_settings');

// Identity / auth data (shared with future Bitrix24 apps)
authDb.createCollection('users');

// Useful indexes
authDb.users.createIndex({ email: 1 }, { unique: true, sparse: true });
authDb.users.createIndex({ phone: 1 }, { unique: true, sparse: true });
authDb.users.createIndex({ bitrix24UserId: 1, bitrix24Domain: 1 }, { unique: true, sparse: true });
appDb.passes.createIndex({ passNumber: 1 }, { unique: true });
appDb.passes.createIndex({ status: 1, visitDate: -1 });
appDb.passes.createIndex({ vehiclePlate: 1 });
appDb.access_events.createIndex({ timestamp: -1 });
appDb.access_events.createIndex({ property: 1, timestamp: -1 });

print(`✅ Database '${appDbName}' initialized (operational data).`);
print(`✅ Database '${authDbName}' initialized (auth / identity).`);
print("Connect: mongodb://localhost:27017/pass24 (app), mongodb://localhost:27017/pass24_auth (auth)");