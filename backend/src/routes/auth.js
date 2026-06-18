const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { auth, mapUser } = require('../middleware/auth');

const router = express.Router();

router.post('/register', (req, res) => {
  const { email, password, fullName, phone, company, office, floor } = req.body;
  if (!email || !password || !fullName) {
    return res.status(400).json({ error: 'Email, пароль и ФИО обязательны' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Email уже зарегистрирован' });

  const id = uuid();
  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, phone, company, role, office, floor)
    VALUES (?, ?, ?, ?, ?, ?, 'tenant', ?, ?)
  `).run(
    id, email.toLowerCase(), passwordHash, fullName,
    phone || null, company || null, office || null, floor || null,
  );

  const user = mapUser(db.prepare('SELECT id, email, full_name, phone, company, role, office, floor FROM users WHERE id = ?').get(id));
  const token = jwt.sign({ userId: id }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });

  res.status(201).json({ user, token });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email и пароль обязательны' });
  }

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }
  if (!row.is_active) {
    return res.status(403).json({ error: 'Аккаунт деактивирован' });
  }

  const token = jwt.sign({ userId: row.id }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });
  const user = mapUser(row);

  res.json({ user, token });
});

router.get('/me', auth(), (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;