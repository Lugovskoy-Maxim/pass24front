const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const audit = require('../services/audit');
const settings = require('../services/settings');

const router = express.Router();

const PASS_TYPES = ['visitor', 'parking', 'delivery', 'contractor'];
const STATUS_TRANSITIONS = {
  approved: ['pending'],
  rejected: ['pending'],
  cancelled: ['pending', 'approved'],
  expired: ['approved', 'active'],
};

function generatePassNumber() {
  const date = new Date();
  const prefix = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const row = db.prepare(`
    SELECT MAX(CAST(SUBSTR(pass_number, LENGTH(?) + 2) AS INTEGER)) as max_num
    FROM passes WHERE pass_number LIKE ?
  `).get(prefix, `${prefix}-%`);
  const next = (row?.max_num || 0) + 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

function mapPass(row) {
  if (!row) return null;
  return {
    id: row.id,
    passNumber: row.pass_number,
    createdBy: row.created_by,
    creatorName: row.creator_name,
    creatorCompany: row.creator_company,
    visitorName: row.visitor_name,
    visitorPhone: row.visitor_phone,
    companyName: row.company_name,
    visitPurpose: row.visit_purpose,
    passType: row.pass_type,
    vehiclePlate: row.vehicle_plate,
    vehicleModel: row.vehicle_model,
    visitDate: row.visit_date,
    visitTimeFrom: row.visit_time_from,
    visitTimeTo: row.visit_time_to,
    office: row.office,
    floor: row.floor,
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

function assertTransition(currentStatus, targetStatus) {
  const allowed = STATUS_TRANSITIONS[targetStatus];
  if (!allowed || !allowed.includes(currentStatus)) {
    throw new Error(`Нельзя перевести заявку из «${currentStatus}» в «${targetStatus}»`);
  }
}

const passSelect = `
  SELECT p.*,
    u.full_name as creator_name,
    u.company as creator_company,
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

  if (req.user.role === 'tenant') {
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
    sql += ` AND (
      p.visitor_name LIKE ? OR p.pass_number LIKE ? OR p.vehicle_plate LIKE ?
      OR p.office LIKE ? OR p.company_name LIKE ? OR p.visit_purpose LIKE ?
    )`;
    const q = `%${String(search).trim()}%`;
    params.push(q, q, q, q, q, q);
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
    WHERE p.visit_date = ? AND p.status IN ('pending', 'approved', 'active', 'completed')
    ORDER BY
      CASE p.status
        WHEN 'pending' THEN 0
        WHEN 'approved' THEN 1
        WHEN 'active' THEN 2
        WHEN 'completed' THEN 3
        ELSE 4
      END,
      p.visit_time_from ASC,
      p.created_at ASC
  `).all(today);

  const stats = {
    total: rows.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    active: rows.filter((r) => r.status === 'active').length,
    completed: rows.filter((r) => r.status === 'completed').length,
    approved: rows.filter((r) => r.status === 'approved').length,
  };

  res.json({ date: today, stats, passes: rows.map(mapPass) });
});

router.get('/:id', auth(), (req, res) => {
  const row = db.prepare(`${passSelect} WHERE p.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Заявка не найдена' });

  if (req.user.role === 'tenant' && row.created_by !== req.user.id) {
    return res.status(403).json({ error: 'Нет доступа' });
  }

  res.json({ pass: mapPass(row) });
});

router.post('/', auth(), requireRole('tenant', 'admin'), (req, res) => {
  const {
    visitorName, visitorPhone, companyName, visitPurpose,
    passType, vehiclePlate, vehicleModel,
    visitDate, visitTimeFrom, visitTimeTo, office, floor, comment,
  } = req.body;

  const name = String(visitorName || '').trim();
  if (!name || !visitDate || !passType) {
    return res.status(400).json({ error: 'ФИО посетителя, дата и тип пропуска обязательны' });
  }

  if (!PASS_TYPES.includes(passType)) {
    return res.status(400).json({ error: 'Недопустимый тип пропуска' });
  }

  if (passType === 'parking' && !String(vehiclePlate || '').trim()) {
    return res.status(400).json({ error: 'Для парковочного пропуска укажите гос. номер' });
  }

  if (visitTimeFrom && visitTimeTo && visitTimeFrom >= visitTimeTo) {
    return res.status(400).json({ error: 'Время «С» должно быть раньше времени «До»' });
  }

  const officeNum = String(office || req.user.office || '').trim();
  if (!officeNum) return res.status(400).json({ error: 'Укажите номер офиса' });

  const limit = settings.checkPassLimit(req.user.id, visitDate);
  if (!limit.allowed) {
    return res.status(429).json({
      error: `Превышен лимит: ${limit.max} пропусков в день (сейчас ${limit.current})`,
    });
  }

  const autoApprove = settings.get('auto_approve_delivery') === 'true' && passType === 'delivery';
  const initialStatus = autoApprove ? 'approved' : 'pending';

  const id = uuid();
  const passNumber = generatePassNumber();
  const floorNum = floor || req.user.floor;
  const tenantCompany = companyName || req.user.company;
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO passes (
        id, pass_number, created_by, visitor_name, visitor_phone, company_name, visit_purpose,
        pass_type, vehicle_plate, vehicle_model, visit_date, visit_time_from, visit_time_to,
        office, floor, comment, status, approved_by, approved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, passNumber, req.user.id, name, visitorPhone || null,
      tenantCompany ? String(tenantCompany).trim() : null,
      visitPurpose ? String(visitPurpose).trim() : null,
      passType,
      vehiclePlate ? String(vehiclePlate).trim().toUpperCase() : null,
      vehicleModel ? String(vehicleModel).trim() : null,
      visitDate,
      visitTimeFrom || null, visitTimeTo || null, officeNum, floorNum || null,
      comment ? String(comment).trim() : null,
      initialStatus, autoApprove ? req.user.id : null, autoApprove ? now : null,
    );
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Конфликт номера пропуска, повторите попытку' });
    }
    throw err;
  }

  audit.log(req.user.id, 'pass.create', 'pass', id, { passNumber, passType, visitDate, office: officeNum });
  const row = db.prepare(`${passSelect} WHERE p.id = ?`).get(id);
  res.status(201).json({ pass: mapPass(row) });
});

router.patch('/:id/status', auth(), (req, res) => {
  const { status, rejectionReason } = req.body;
  const allowed = ['approved', 'rejected', 'cancelled', 'expired'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Недопустимый статус' });
  }

  const existing = db.prepare('SELECT * FROM passes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Заявка не найдена' });

  const isOwner = existing.created_by === req.user.id;
  const isStaff = req.user.role === 'security' || req.user.role === 'admin';

  if (status === 'cancelled') {
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Отменить заявку может только её автор' });
    }
  } else if (!isStaff) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }

  if (status === 'rejected' && !String(rejectionReason || '').trim()) {
    return res.status(400).json({ error: 'Укажите причину отклонения' });
  }

  try {
    assertTransition(existing.status, status);
  } catch (err) {
    return res.status(400).json({ error: err.message });
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
    `).run(String(rejectionReason).trim(), req.user.id, now, now, req.params.id);
  } else {
    db.prepare('UPDATE passes SET status = ?, updated_at = ? WHERE id = ?').run(status, now, req.params.id);
  }

  audit.log(req.user.id, `pass.${status}`, 'pass', req.params.id);
  const row = db.prepare(`${passSelect} WHERE p.id = ?`).get(req.params.id);
  res.json({ pass: mapPass(row) });
});

router.post('/:id/check-in', auth(), requireRole('security', 'admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM passes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Заявка не найдена' });

  if (existing.status !== 'approved') {
    return res.status(400).json({ error: 'Пропустить можно только одобренную заявку' });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE passes SET status = 'active', checked_in_at = ?, checked_in_by = ?, updated_at = ?
    WHERE id = ?
  `).run(now, req.user.id, now, req.params.id);

  audit.log(req.user.id, 'pass.check_in', 'pass', req.params.id);
  const row = db.prepare(`${passSelect} WHERE p.id = ?`).get(req.params.id);
  res.json({ pass: mapPass(row) });
});

router.post('/:id/check-out', auth(), requireRole('security', 'admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM passes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Заявка не найдена' });

  if (existing.status !== 'active') {
    return res.status(400).json({ error: 'Посетитель не в здании' });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE passes SET status = 'completed', checked_out_at = ?, checked_out_by = ?, updated_at = ?
    WHERE id = ?
  `).run(now, req.user.id, now, req.params.id);

  audit.log(req.user.id, 'pass.check_out', 'pass', req.params.id);
  const row = db.prepare(`${passSelect} WHERE p.id = ?`).get(req.params.id);
  res.json({ pass: mapPass(row) });
});

module.exports = router;