require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('./db');

const users = [
  { email: 'admin@pass24.local', password: 'admin123', fullName: 'Администратор Системы', role: 'admin', apartment: null, building: null },
  { email: 'security@pass24.local', password: 'security123', fullName: 'Иванов Сергей', role: 'security', apartment: null, building: 'КПП-1' },
  { email: 'resident@pass24.local', password: 'resident123', fullName: 'Петрова Анна', role: 'resident', apartment: '42', building: 'Корпус А' },
  { email: 'resident2@pass24.local', password: 'resident123', fullName: 'Сидоров Дмитрий', role: 'resident', apartment: '15', building: 'Корпус Б' },
];

console.log('Seeding database...');

for (const u of users) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
  if (existing) continue;

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, apartment, building)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuid(), u.email, bcrypt.hashSync(u.password, 10), u.fullName, u.role, u.apartment, u.building);
}

const resident = db.prepare("SELECT id, apartment, building FROM users WHERE email = 'resident@pass24.local'").get();
const security = db.prepare("SELECT id FROM users WHERE email = 'security@pass24.local'").get();
const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

const samplePasses = [
  {
    id: uuid(), passNumber: `${today.replace(/-/g, '')}-0001`,
    createdBy: resident.id, guestName: 'Козлов Алексей', guestPhone: '+7 900 111-22-33',
    passType: 'guest', visitDate: today, visitTimeFrom: '10:00', visitTimeTo: '18:00',
    apartment: resident.apartment, building: resident.building, status: 'approved',
    approvedBy: security.id,
  },
  {
    id: uuid(), passNumber: `${today.replace(/-/g, '')}-0002`,
    createdBy: resident.id, guestName: 'Морозов Игорь', guestPhone: '+7 900 444-55-66',
    passType: 'vehicle', vehiclePlate: 'А123ВС777', vehicleModel: 'Toyota Camry',
    visitDate: today, visitTimeFrom: '14:00', visitTimeTo: '16:00',
    apartment: resident.apartment, building: resident.building, status: 'pending',
  },
  {
    id: uuid(), passNumber: `${tomorrow.replace(/-/g, '')}-0001`,
    createdBy: resident.id, guestName: 'Доставка Ozon', guestPhone: '+7 900 777-88-99',
    passType: 'delivery', visitDate: tomorrow, visitTimeFrom: '12:00', visitTimeTo: '13:00',
    apartment: resident.apartment, building: resident.building, status: 'pending',
    comment: 'Крупногабаритная посылка',
  },
];

for (const p of samplePasses) {
  const exists = db.prepare('SELECT id FROM passes WHERE pass_number = ?').get(p.passNumber);
  if (exists) continue;

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO passes (
      id, pass_number, created_by, guest_name, guest_phone, pass_type,
      vehicle_plate, vehicle_model, visit_date, visit_time_from, visit_time_to,
      apartment, building, comment, status, approved_by, approved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    p.id, p.passNumber, p.createdBy, p.guestName, p.guestPhone || null, p.passType,
    p.vehiclePlate || null, p.vehicleModel || null, p.visitDate,
    p.visitTimeFrom || null, p.visitTimeTo || null, p.apartment, p.building || null,
    p.comment || null, p.status, p.approvedBy || null, p.approvedBy ? now : null,
  );
}

console.log('Done! Test accounts:');
console.log('  admin@pass24.local / admin123');
console.log('  security@pass24.local / security123');
console.log('  resident@pass24.local / resident123');