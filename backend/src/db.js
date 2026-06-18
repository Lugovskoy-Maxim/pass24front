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

  CREATE INDEX IF NOT EXISTS idx_passes_status ON passes(status);
  CREATE INDEX IF NOT EXISTS idx_passes_visit_date ON passes(visit_date);
  CREATE INDEX IF NOT EXISTS idx_passes_created_by ON passes(created_by);
`);

module.exports = db;