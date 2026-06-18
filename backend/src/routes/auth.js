const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.post('/register', (req, res) => {
  const { email, password, fullName, phone, apartment, building } = req.body;
  if (!email || !password || !fullName) {
    return res.status(400).json({ error: 'Email, пароль и ФИО обязательны' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Email уже зарегистрирован' });

  const id = uuid();
  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, phone, role, apartment, building)
    VALUES (?, ?, ?, ?, ?, 'resident', ?, ?)
  `).run(id, email.toLowerCase(), passwordHash, fullName, phone || null, apartment || null, building || null);

  const user = db.prepare('SELECT id, email, full_name, phone, role, apartment, building FROM users WHERE id = ?').get(id);
  const token = jwt.sign({ userId: id }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });

  res.status(201).json({ user, token });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email и пароль обязательны' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });
  const { password_hash, ...safeUser } = user;

  res.json({ user: safeUser, token });
});

router.get('/me', auth(), (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;