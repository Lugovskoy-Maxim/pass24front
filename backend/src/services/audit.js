const { v4: uuid } = require('uuid');
const db = require('../db');

function log(userId, action, entityType, entityId, details = null) {
  db.prepare(`
    INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(uuid(), userId, action, entityType, entityId, details ? JSON.stringify(details) : null);
}

function getRecent(limit = 50, offset = 0) {
  return db.prepare(`
    SELECT a.*, u.full_name as user_name, u.email as user_email
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

function mapEntry(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    details: row.details ? JSON.parse(row.details) : null,
    createdAt: row.created_at,
  };
}

module.exports = { log, getRecent, mapEntry };