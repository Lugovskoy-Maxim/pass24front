const db = require('../db');

function mapOffice(row) {
  if (!row) return null;
  return {
    id: row.id,
    number: row.number,
    floor: row.floor,
    areaSqm: row.area_sqm,
    company: row.company,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    isActive: !!row.is_active,
    createdAt: row.created_at,
  };
}

const officeSelect = `
  SELECT o.*, u.full_name as tenant_name
  FROM offices o
  LEFT JOIN users u ON u.id = o.tenant_id
`;

function getAll(activeOnly = false) {
  let sql = officeSelect;
  if (activeOnly) sql += ' WHERE o.is_active = 1';
  sql += ' ORDER BY o.floor, o.number';
  return db.prepare(sql).all().map(mapOffice);
}

function getByNumberFloor(number, floor) {
  const row = db.prepare(`${officeSelect} WHERE o.number = ? AND o.floor = ?`).get(number, floor);
  return mapOffice(row);
}

function validateTenantOffice(user, office, floor) {
  if (user.role === 'admin') return { ok: true };
  if (user.office && user.office !== office) {
    return { ok: false, error: `Арендатор может заказывать пропуска только для офиса ${user.office}` };
  }
  const registered = db.prepare('SELECT id FROM offices WHERE number = ? AND is_active = 1').get(office);
  if (!registered) {
    return { ok: true }; // офис не в реестре — разрешаем с предупреждением
  }
  if (registered && floor) {
    const match = db.prepare('SELECT id FROM offices WHERE number = ? AND floor = ? AND is_active = 1').get(office, floor);
    if (!match) return { ok: false, error: 'Офис не найден в реестре БЦ' };
  }
  return { ok: true };
}

module.exports = { mapOffice, getAll, getByNumberFloor, validateTenantOffice, officeSelect };