const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const audit = require('../services/audit');
const settings = require('../services/settings');

const router = express.Router();
router.use(auth(), requireRole('admin'));

const ROLES = ['tenant', 'security', 'admin'];

function mapUser(row) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    company: row.company,
    role: row.role,
    office: row.office,
    floor: row.floor,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    passesCount: row.passes_count ?? undefined,
  };
}

router.get('/dashboard', (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const usersByRole = db.prepare(`
    SELECT role, COUNT(*) as count FROM users WHERE is_active = 1 GROUP BY role
  `).all();

  const passesByStatus = db.prepare('SELECT status, COUNT(*) as count FROM passes GROUP BY status').all();
  const todayPasses = db.prepare('SELECT COUNT(*) as c FROM passes WHERE visit_date = ?').get(today).c;
  const weekPasses = db.prepare(`
    SELECT COUNT(*) as c FROM passes WHERE visit_date >= date('now', '-7 days')
  `).get().c;

  const recentActivity = audit.getRecent(10).map(audit.mapEntry);

  const revenue = db.prepare(`
    SELECT SUM(p.price_monthly) as total
    FROM business_centers bc
    JOIN pricing_plans p ON p.id = bc.plan_id
    WHERE bc.is_active = 1
  `).get();

  res.json({
    stats: {
      users: {
        total: db.prepare('SELECT COUNT(*) as c FROM users WHERE is_active = 1').get().c,
        byRole: Object.fromEntries(usersByRole.map((r) => [r.role, r.count])),
      },
      passes: {
        total: db.prepare('SELECT COUNT(*) as c FROM passes').get().c,
        today: todayPasses,
        week: weekPasses,
        byStatus: Object.fromEntries(passesByStatus.map((r) => [r.status, r.count])),
      },
      revenue: {
        monthlyTotal: revenue?.total || 0,
        businessCenters: db.prepare('SELECT COUNT(*) as c FROM business_centers WHERE is_active = 1').get().c,
      },
    },
    recentActivity,
    settings: settings.getAll(),
  });
});

router.get('/users', (req, res) => {
  const { role, search } = req.query;
  let sql = `
    SELECT u.*, (SELECT COUNT(*) FROM passes p WHERE p.created_by = u.id) as passes_count
    FROM users u WHERE 1=1
  `;
  const params = [];

  if (role) { sql += ' AND u.role = ?'; params.push(role); }
  if (search) {
    sql += ' AND (u.full_name LIKE ? OR u.email LIKE ? OR u.office LIKE ? OR u.company LIKE ?)';
    const q = `%${String(search).trim()}%`;
    params.push(q, q, q, q);
  }

  sql += ' ORDER BY u.created_at DESC LIMIT 200';
  const rows = db.prepare(sql).all(...params);
  res.json({ users: rows.map(mapUser) });
});

router.post('/users', (req, res) => {
  const { email, password, fullName, phone, company, role, office, floor } = req.body;

  if (!email || !password || !fullName || !role) {
    return res.status(400).json({ error: 'Email, пароль, ФИО и роль обязательны' });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: 'Недопустимая роль' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Email уже зарегистрирован' });

  const id = uuid();
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, phone, company, role, office, floor, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    id, email.toLowerCase(), bcrypt.hashSync(password, 10), fullName,
    phone || null, company || null, role, office || null, floor || null,
  );

  audit.log(req.user.id, 'user.create', 'user', id, { email, role, company });
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.status(201).json({ user: mapUser(row) });
});

router.patch('/users/:id', (req, res) => {
  const { fullName, phone, company, role, office, floor, isActive, password } = req.body;
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Пользователь не найден' });

  if (req.params.id === req.user.id && role && role !== 'admin') {
    return res.status(400).json({ error: 'Нельзя снять с себя роль администратора' });
  }
  if (role && !ROLES.includes(role)) {
    return res.status(400).json({ error: 'Недопустимая роль' });
  }

  const updates = [];
  const params = [];

  if (fullName !== undefined) { updates.push('full_name = ?'); params.push(fullName); }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone || null); }
  if (company !== undefined) { updates.push('company = ?'); params.push(company || null); }
  if (role !== undefined) { updates.push('role = ?'); params.push(role); }
  if (office !== undefined) { updates.push('office = ?'); params.push(office || null); }
  if (floor !== undefined) { updates.push('floor = ?'); params.push(floor || null); }
  if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }
  if (password) { updates.push('password_hash = ?'); params.push(bcrypt.hashSync(password, 10)); }

  if (updates.length === 0) return res.status(400).json({ error: 'Нет данных для обновления' });

  params.push(req.params.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  audit.log(req.user.id, 'user.update', 'user', req.params.id, { role, isActive });
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  res.json({ user: mapUser(row) });
});

router.get('/pricing', (_req, res) => {
  const plans = db.prepare('SELECT * FROM pricing_plans ORDER BY price_monthly ASC').all();
  res.json({
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      priceMonthly: p.price_monthly,
      maxOffices: p.max_offices,
      features: JSON.parse(p.features),
      isActive: !!p.is_active,
    })),
  });
});

router.patch('/pricing/:id', (req, res) => {
  const { name, description, priceMonthly, maxOffices, features, isActive } = req.body;
  const existing = db.prepare('SELECT * FROM pricing_plans WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Тариф не найден' });

  db.prepare(`
    UPDATE pricing_plans SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      price_monthly = COALESCE(?, price_monthly),
      max_offices = COALESCE(?, max_offices),
      features = COALESCE(?, features),
      is_active = COALESCE(?, is_active),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name ?? null, description ?? null, priceMonthly ?? null,
    maxOffices ?? null, features ? JSON.stringify(features) : null,
    isActive !== undefined ? (isActive ? 1 : 0) : null,
    req.params.id,
  );

  audit.log(req.user.id, 'pricing.update', 'pricing_plan', req.params.id, { priceMonthly });
  const row = db.prepare('SELECT * FROM pricing_plans WHERE id = ?').get(req.params.id);
  res.json({
    plan: {
      id: row.id,
      name: row.name,
      description: row.description,
      priceMonthly: row.price_monthly,
      maxOffices: row.max_offices,
      features: JSON.parse(row.features),
      isActive: !!row.is_active,
    },
  });
});

router.get('/business-centers', (_req, res) => {
  const rows = db.prepare(`
    SELECT bc.*, p.name as plan_name, p.price_monthly
    FROM business_centers bc
    JOIN pricing_plans p ON p.id = bc.plan_id
    ORDER BY bc.name
  `).all();

  res.json({
    businessCenters: rows.map((c) => ({
      id: c.id,
      name: c.name,
      address: c.address,
      officesCount: c.offices_count,
      totalAreaSqm: c.total_area_sqm,
      planId: c.plan_id,
      planName: c.plan_name,
      priceMonthly: c.price_monthly,
      isActive: !!c.is_active,
      createdAt: c.created_at,
    })),
  });
});

router.get('/audit', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = parseInt(req.query.offset || '0', 10);
  const rows = audit.getRecent(limit, offset);
  const total = db.prepare('SELECT COUNT(*) as c FROM audit_log').get().c;
  res.json({ entries: rows.map(audit.mapEntry), total });
});

router.get('/settings', (_req, res) => {
  res.json({ settings: settings.getAll() });
});

router.patch('/settings', (req, res) => {
  const updated = settings.setMany(req.body);
  audit.log(req.user.id, 'settings.update', 'settings', null, req.body);
  res.json({ settings: updated });
});

module.exports = router;