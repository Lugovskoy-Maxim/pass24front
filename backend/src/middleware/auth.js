const jwt = require('jsonwebtoken');
const db = require('../db');

function auth(required = true) {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      if (required) return res.status(401).json({ error: 'Требуется авторизация' });
      return next();
    }

    try {
      const token = header.slice(7);
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
      const user = db.prepare('SELECT id, email, full_name, phone, role, apartment, building FROM users WHERE id = ?').get(payload.userId);
      if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
      req.user = user;
      next();
    } catch {
      return res.status(401).json({ error: 'Недействительный токен' });
    }
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    next();
  };
}

module.exports = { auth, requireRole };