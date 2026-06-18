const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'pass24.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL CHECK(role IN ('resident', 'security', 'admin')),
    apartment TEXT,
    building TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS passes (
    id TEXT PRIMARY KEY,
    pass_number TEXT UNIQUE NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id),
    guest_name TEXT NOT NULL,
    guest_phone TEXT,
    pass_type TEXT NOT NULL CHECK(pass_type IN ('guest', 'vehicle', 'delivery', 'service')),
    vehicle_plate TEXT,
    vehicle_model TEXT,
    visit_date TEXT NOT NULL,
    visit_time_from TEXT,
    visit_time_to TEXT,
    apartment TEXT NOT NULL,
    building TEXT,
    comment TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'active', 'completed', 'expired', 'cancelled')),
    approved_by TEXT REFERENCES users(id),
    approved_at TEXT,
    rejection_reason TEXT,
    checked_in_at TEXT,
    checked_in_by TEXT REFERENCES users(id),
    checked_out_at TEXT,
    checked_out_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pricing_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price_monthly INTEGER NOT NULL,
    max_apartments INTEGER NOT NULL,
    features TEXT NOT NULL DEFAULT '[]',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS complexes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    apartments_count INTEGER NOT NULL DEFAULT 0,
    plan_id TEXT NOT NULL REFERENCES pricing_plans(id),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_passes_status ON passes(status);
  CREATE INDEX IF NOT EXISTS idx_passes_visit_date ON passes(visit_date);
  CREATE INDEX IF NOT EXISTS idx_passes_created_by ON passes(created_by);
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
`);

try {
  db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
} catch {
  // column already exists
}

module.exports = db;