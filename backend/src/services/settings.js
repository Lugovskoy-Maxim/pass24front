const db = require('../db');

const DEFAULTS = {
  complex_name: 'ЖК PASS24',
  max_passes_per_day: '10',
  auto_approve_delivery: 'false',
  working_hours_from: '08:00',
  working_hours_to: '22:00',
  contact_phone: '+7 (495) 000-00-00',
  contact_email: 'support@pass24.local',
};

function getAll() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = { ...DEFAULTS };
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

function get(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : DEFAULTS[key] ?? null;
}

function set(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, String(value));
}

function setMany(updates) {
  const allowed = Object.keys(DEFAULTS);
  for (const [key, value] of Object.entries(updates)) {
    if (allowed.includes(key)) set(key, value);
  }
  return getAll();
}

function checkPassLimit(userId, visitDate) {
  const max = parseInt(get('max_passes_per_day') || '10', 10);
  const count = db.prepare(`
    SELECT COUNT(*) as c FROM passes
    WHERE created_by = ? AND visit_date = ? AND status NOT IN ('cancelled', 'rejected')
  `).get(userId, visitDate).c;
  return { allowed: count < max, current: count, max };
}

module.exports = { getAll, get, set, setMany, checkPassLimit, DEFAULTS };