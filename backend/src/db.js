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
    company TEXT,
    role TEXT NOT NULL CHECK(role IN ('tenant', 'security', 'admin')),
    office TEXT,
    floor TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS passes (
    id TEXT PRIMARY KEY,
    pass_number TEXT UNIQUE NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id),
    visitor_name TEXT NOT NULL,
    visitor_phone TEXT,
    company_name TEXT,
    visit_purpose TEXT,
    pass_type TEXT NOT NULL CHECK(pass_type IN ('visitor', 'parking', 'delivery', 'contractor')),
    vehicle_plate TEXT,
    vehicle_model TEXT,
    visit_date TEXT NOT NULL,
    visit_time_from TEXT,
    visit_time_to TEXT,
    office TEXT NOT NULL,
    floor TEXT,
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
    max_offices INTEGER NOT NULL,
    features TEXT NOT NULL DEFAULT '[]',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS business_centers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    offices_count INTEGER NOT NULL DEFAULT 0,
    total_area_sqm INTEGER DEFAULT 0,
    plan_id TEXT NOT NULL REFERENCES pricing_plans(id),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS offices (
    id TEXT PRIMARY KEY,
    number TEXT NOT NULL,
    floor TEXT NOT NULL,
    area_sqm REAL,
    company TEXT,
    tenant_id TEXT REFERENCES users(id),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(number, floor)
  );

  CREATE TABLE IF NOT EXISTS vehicle_blacklist (
    id TEXT PRIMARY KEY,
    plate TEXT UNIQUE NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_passes_status ON passes(status);
  CREATE INDEX IF NOT EXISTS idx_passes_visit_date ON passes(visit_date);
  CREATE INDEX IF NOT EXISTS idx_passes_created_by ON passes(created_by);
  CREATE INDEX IF NOT EXISTS idx_passes_number ON passes(pass_number);
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_offices_number ON offices(number);
`);

function migrateFromResidential() {
  const userSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);

  if (userSql?.sql?.includes("'resident'")) {
    try { db.exec('DROP TABLE IF EXISTS users_new'); } catch { /* */ }
    if (userCols.includes('apartment') && !userCols.includes('office')) {
      try { db.exec('ALTER TABLE users RENAME COLUMN apartment TO office'); } catch { /* */ }
    }
    if (userCols.includes('building') && !userCols.includes('floor')) {
      try { db.exec('ALTER TABLE users RENAME COLUMN building TO floor'); } catch { /* */ }
    }
    try { db.exec('ALTER TABLE users ADD COLUMN company TEXT'); } catch { /* */ }

    const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
    db.exec(`
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT,
        company TEXT,
        role TEXT NOT NULL CHECK(role IN ('tenant', 'security', 'admin')),
        office TEXT,
        floor TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO users_new (id, email, password_hash, full_name, phone, company, role, office, floor, is_active, created_at)
      SELECT id, email, password_hash, full_name, phone,
        ${cols.includes('company') ? 'company' : 'NULL'},
        CASE WHEN role = 'resident' THEN 'tenant' ELSE role END,
        office, floor, COALESCE(is_active, 1), created_at
      FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
  } else {
    try { db.exec('ALTER TABLE users ADD COLUMN company TEXT'); } catch { /* */ }
  }

  const passCols = db.prepare('PRAGMA table_info(passes)').all().map((c) => c.name);
  if (passCols.includes('guest_name')) {
    db.exec(`
      CREATE TABLE passes_new (
        id TEXT PRIMARY KEY,
        pass_number TEXT UNIQUE NOT NULL,
        created_by TEXT NOT NULL REFERENCES users(id),
        visitor_name TEXT NOT NULL,
        visitor_phone TEXT,
        company_name TEXT,
        visit_purpose TEXT,
        pass_type TEXT NOT NULL CHECK(pass_type IN ('visitor', 'parking', 'delivery', 'contractor')),
        vehicle_plate TEXT,
        vehicle_model TEXT,
        visit_date TEXT NOT NULL,
        visit_time_from TEXT,
        visit_time_to TEXT,
        office TEXT NOT NULL,
        floor TEXT,
        comment TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
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
      INSERT INTO passes_new SELECT
        id, pass_number, created_by, guest_name, guest_phone, NULL, NULL,
        CASE pass_type
          WHEN 'guest' THEN 'visitor'
          WHEN 'vehicle' THEN 'parking'
          WHEN 'service' THEN 'contractor'
          ELSE pass_type
        END,
        vehicle_plate, vehicle_model, visit_date, visit_time_from, visit_time_to,
        apartment, building, comment, status,
        approved_by, approved_at, rejection_reason,
        checked_in_at, checked_in_by, checked_out_at, checked_out_by,
        created_at, updated_at
      FROM passes;
      DROP TABLE passes;
      ALTER TABLE passes_new RENAME TO passes;
      CREATE INDEX IF NOT EXISTS idx_passes_status ON passes(status);
      CREATE INDEX IF NOT EXISTS idx_passes_visit_date ON passes(visit_date);
      CREATE INDEX IF NOT EXISTS idx_passes_created_by ON passes(created_by);
    `);
  } else {
    try { db.exec('ALTER TABLE passes ADD COLUMN company_name TEXT'); } catch { /* */ }
    try { db.exec('ALTER TABLE passes ADD COLUMN visit_purpose TEXT'); } catch { /* */ }
    if (passCols.includes('apartment') && !passCols.includes('office')) {
      db.exec('ALTER TABLE passes RENAME COLUMN apartment TO office');
    }
    if (passCols.includes('building') && !passCols.includes('floor')) {
      db.exec('ALTER TABLE passes RENAME COLUMN building TO floor');
    }
    if (passCols.includes('guest_name') && !passCols.includes('visitor_name')) {
      db.exec('ALTER TABLE passes RENAME COLUMN guest_name TO visitor_name');
    }
    if (passCols.includes('guest_phone') && !passCols.includes('visitor_phone')) {
      db.exec('ALTER TABLE passes RENAME COLUMN guest_phone TO visitor_phone');
    }
  }

  const hasComplexes = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='complexes'").get();
  const hasBC = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='business_centers'").get();
  if (hasComplexes && !hasBC) {
    db.exec(`
      CREATE TABLE business_centers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT,
        offices_count INTEGER NOT NULL DEFAULT 0,
        total_area_sqm INTEGER DEFAULT 0,
        plan_id TEXT NOT NULL REFERENCES pricing_plans(id),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO business_centers (id, name, address, offices_count, plan_id, is_active, created_at)
      SELECT id, name, address, apartments_count, plan_id, is_active, created_at FROM complexes;
      DROP TABLE complexes;
    `);
  }

  const planCols = db.prepare('PRAGMA table_info(pricing_plans)').all().map((c) => c.name);
  if (planCols.includes('max_apartments') && !planCols.includes('max_offices')) {
    db.exec('ALTER TABLE pricing_plans RENAME COLUMN max_apartments TO max_offices');
  }

  const oldSetting = db.prepare("SELECT value FROM settings WHERE key = 'complex_name'").get();
  if (oldSetting) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('business_center_name', ?, datetime('now'))").run(oldSetting.value);
    db.prepare("DELETE FROM settings WHERE key = 'complex_name'").run();
  }
}

function runMigrations() {
  db.pragma('foreign_keys = OFF');
  try {
    migrateFromResidential();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

runMigrations();

module.exports = db;