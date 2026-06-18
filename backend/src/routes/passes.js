const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

function generatePassNumber() {
  const date = new Date();
  const prefix = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const count = db.prepare('SELECT COUNT(*) as c FROM passes WHERE pass_number LIKE ?').get(`${prefix}%`).c;
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

function mapPass(row) {
  if (!row) return null;
  return {
    id: row.id,
    passNumber: row.pass_number,
    createdBy: row.created_by,
    creatorName: row.creator_name,
    guestName: row.guest_name,
    guestPhone: row.guest_phone,
    passType: row.pass_type,
    vehiclePlate: row.vehicle_plate,
    vehicleModel: row.vehicle_model,
    visitDate: row.visit_date,
    visitTimeFrom: row.visit_time_from,
    visitTimeTo: row.visit_time_to,
    apartment: row.apartment,
    building: row.building,
    comment: row.comment,
    status: row.status,
    approvedBy: row.approved_by,
    approverName: row.approver_name,
    approvedAt: row.approved_at,
    rejectionReason: row.rejection_reason,
    checkedInAt: row.checked_in_at,
    checkedInBy: row.checked_in_by,
    checkerInName: row.checker_in_name,
    checkedOutAt: row.checked_out_at,
    checkedOutBy: row.checked_out_by,
    checkerOutName: row.checker_out_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const passSelect = `
  SELECT p.*,
    u.full_name as creator_name,
    a.full_name as approver_name,
    ci.full_name as checker_in_name,
    co.full_name as checker_out_name
  FROM passes p
  LEFT JOIN users u ON u.id = p.created_by
  LEFT JOIN users a ON a.id = p.approved_by
  LEFT JOIN users ci ON ci.id = p.checked_in_by
  LEFT JOIN users co ON co.id = p.checked_out_by
`;

router.get('/', auth(), (req, res) => {
  const { status, date, search } = req.query;
  let sql = `${passSelect} WHERE 1=1`;
  const params = [];

  if (req.user.role === 'resident') {
    sql += ' AND p.created_by = ?';
    params.push(req.user.id);
  }

  if (status) {
    sql += ' AND p.status = ?';
    params.push(status);
  }

  if (date) {
    sql += ' AND p.visit_date = ?';
    params.push(date);
  }

  if (search) {
    sql += ' AND (p.guest_name LIKE ? OR p.pass_number LIKE ? OR p.vehicle_plate LIKE ? OR p.apartment LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }

  sql += ' ORDER BY p.created_at DESC LIMIT 200';

  const rows = db.prepare(sql).all(...params);
  res.json({ passes: rows.map(mapPass) });
});

router.get('/journal', auth(), requireRole('security', 'admin'), (req, res) => {
  const { date } = req.query;
  const today = date || new Date().toISOString().slice(0, 10);

  const rows = db.prepare(`
    ${passSelect}
    WHERE p.visit_date = ? AND p.status IN ('approved', 'active', 'completed')
    ORDER BY p.visit_time_from ASC, p.created_at ASC
  `).all(today);

  const stats = {
    total: rows.length,
    active: rows.filter((r) => r.status === 'active').length,
    completed: rows.filter((r) => r.status === 'completed').length,
    approved: rows.filter((r) => r.status === 'approved').length,
  };

  res.json({ date: today, stats, passes: rows.map(mapPass) });
});

router.get('/:id', auth(), (req, res) => {
  const row = db.prepare(`${passSelect} WHERE p.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Заявка не найдена' });

  if (req.user.role === 'resident' && row.created_by !== req.user.id) {
    return res.status(403).json({ error: 'Нет доступа' });
  }

  res.json({ pass: mapPass(row) });
});

router.post('/', auth(), requireRole('resident', 'admin'), (req, res) => {
  const {
    guestName, guestPhone, passType, vehiclePlate, vehicleModel,
    visitDate, visitTimeFrom, visitTimeTo, apartment, building, comment,
  } = req.body;

  if (!guestName || !visitDate || !passType) {
    return res.status(400).json({ error: 'Имя гостя, дата и тип пропуска обязательны' });
  }

  const apt = apartment || req.user.apartment;
  if (!apt) return res.status(400).json({ error: 'Укажите номер квартиры' });

  const id = uuid();
  const passNumber = generatePassNumber();
  const bld = building || req.user.building;

  db.prepare(`
    INSERT INTO passes (
      id, pass_number, created_by, guest_name, guest_phone, pass_type,
      vehicle_plate, vehicle_model, visit_date, visit_time_from, visit_time_to,
      apartment, building, comment, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    id, passNumber, req.user.id, guestName, guestPhone || null, passType,
    vehiclePlate || null, vehicleModel || null, visitDate,
    visitTimeFrom || null, visitTimeTo || null, apt, bld || null, comment || null,
  );

  const row = db.prepare(`${passSelect} WHERE p.id = ?`).get(id);
  res.status(201).json({ pass: mapPass(row) });
});

router.patch('/:id/status', auth(), requireRole('security', 'admin'), (req, res) => {
  const { status, rejectionReason } = req.body;
  const allowed = ['approved', 'rejected', 'cancelled', 'expired'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Недопустимый статус' });
  }

  const existing = db.prepare('SELECT * FROM passes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Заявка не найдена' });

  if (status === 'rejected' && !rejectionReason) {
    return res.status(400).json({ error: 'Укажите причину отклонения' });
  }

  const now = new Date().toISOString();

  if (status === 'approved') {
    db.prepare(`
      UPDATE passes SET status = 'approved', approved_by = ?, approved_at = ?, updated_at = ?
      WHERE id = ?
    `).run(req.user.id, now, now, req.params.id);
  } else if (status === 'rejected') {
    db.prepare(`
      UPDATE passes SET status = 'rejected', rejection_reason = ?, approved_by = ?, approved_at = ?, updated_at = ?
      WHERE id = ?
    `).run(rejectionReason, req.user.id, now, now, req.params.id);
  } else {
    db.prepare('UPDATE passes SET status = ?, updated_at = ? WHERE id = ?').run(status, now, req.params.id);
  }

  const row = db.prepare(`${passSelect} WHERE p.id = ?`).get(req.params.id);
  res.json({ pass: mapPass(row) });
});

router.post('/:id/check-in', auth(), requireRole('security', 'admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM passes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Заявка не найдена' });

  if (!['approved', 'active'].includes(existing.status)) {
    return res.status(400).json({ error: 'Пропуск нельзя активировать в текущем статусе' });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE passes SET status = 'active', checked_in_at = ?, checked_in_by = ?, updated_at = ?
    WHERE id = ?
  `).run(now, req.user.id, now, req.params.id);

  const row = db.prepare(`${passSelect} WHERE p.id = ?`).get(req.params.id);
  res.json({ pass: mapPass(row) });
});

router.post('/:id/check-out', auth(), requireRole('security', 'admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM passes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Заявка не найдена' });

  if (existing.status !== 'active') {
    return res.status(400).json({ error: 'Гость не на территории' });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE passes SET status = 'completed', checked_out_at = ?, checked_out_by = ?, updated_at = ?
    WHERE id = ?
  `).run(now, req.user.id, now, req.params.id);

  const row = db.prepare(`${passSelect} WHERE p.id = ?`).get(req.params.id);
  res.json({ pass: mapPass(row) });
});

module.exports = router;