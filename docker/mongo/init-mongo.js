// MongoDB initialization script for PASS24
// This file is executed automatically when the container starts for the first time.

print("🔧 Initializing PASS24 MongoDB database...");

const dbName = 'pass24';
const db = db.getSiblingDB(dbName);

// Create the database (it will be created on first write, but we ensure it)
db.createCollection('users');
db.createCollection('properties');
db.createCollection('passes');
db.createCollection('pass_requests');
db.createCollection('access_events');
db.createCollection('vehicles');
db.createCollection('authorizations');

// Create useful indexes
db.users.createIndex({ email: 1 }, { unique: true, sparse: true });
db.users.createIndex({ phone: 1 }, { unique: true, sparse: true });
db.passes.createIndex({ passNumber: 1 }, { unique: true });
db.passes.createIndex({ status: 1, visitDate: -1 });
db.passes.createIndex({ vehiclePlate: 1 });
db.access_events.createIndex({ timestamp: -1 });
db.access_events.createIndex({ property: 1, timestamp: -1 });

print(`✅ Database '${dbName}' initialized successfully with collections and indexes.`);
print("You can now connect with: mongodb://localhost:27017/pass24");
