require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('./db');
const settings = require('./services/settings');

const users = [
  { email: 'admin@pass24.local', password: 'admin123', fullName: 'Администратор БЦ', role: 'admin', company: 'УК Сити-Плаза', office: null, floor: null },
  { email: 'security@pass24.local', password: 'security123', fullName: 'Иванов Сергей', role: 'security', company: 'Служба охраны', office: null, floor: '1' },
  { email: 'tenant@pass24.local', password: 'tenant123', fullName: 'Петрова Анна', role: 'tenant', company: 'ООО «ТехноСофт»', office: '401', floor: '4' },
  { email: 'tenant2@pass24.local', password: 'tenant123', fullName: 'Сидоров Дмитрий', role: 'tenant', company: 'ИП Сидоров', office: '215', floor: '2' },
];

const pricingPlans = [
  {
    id: 'plan-basic',
    name: 'Старт',
    description: 'До 50 офисов, журнал посетителей, мобильный доступ арендаторов',
    priceMonthly: 29900,
    maxOffices: 50,
    features: ['Журнал посетителей', 'Пропуска для арендаторов', 'Ресепшн-панель', 'Email-поддержка'],
  },
  {
    id: 'plan-standard',
    name: 'Бизнес',
    description: 'До 200 офисов, парковка, интеграция СКУД, аналитика посещаемости',
    priceMonthly: 79900,
    maxOffices: 200,
    features: ['Всё из Старт', 'Парковочные пропуска', 'Интеграция СКУД', 'Аналитика аренды', 'Приоритетная поддержка'],
  },
  {
    id: 'plan-premium',
    name: 'Корпоративный',
    description: 'Безлимит офисов, API, мульти-БЦ, выделенный менеджер',
    priceMonthly: 199000,
    maxOffices: 99999,
    features: ['Всё из Бизнес', 'REST API', 'Несколько БЦ', 'Выделенный менеджер', 'SLA 99.9%'],
  },
];

console.log('Seeding database...');

for (const plan of pricingPlans) {
  const exists = db.prepare('SELECT id FROM pricing_plans WHERE id = ?').get(plan.id);
  if (exists) {
    db.prepare(`
      UPDATE pricing_plans SET name=?, description=?, price_monthly=?, max_offices=?, features=?, updated_at=datetime('now')
      WHERE id=?
    `).run(plan.name, plan.description, plan.priceMonthly, plan.maxOffices, JSON.stringify(plan.features), plan.id);
  } else {
    db.prepare(`
      INSERT INTO pricing_plans (id, name, description, price_monthly, max_offices, features)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(plan.id, plan.name, plan.description, plan.priceMonthly, plan.maxOffices, JSON.stringify(plan.features));
  }
}

const businessCenters = [
  { id: 'bc-1', name: 'БЦ Сити-Плаза', address: 'г. Москва, Пресненская наб., 12', officesCount: 180, totalAreaSqm: 24000, planId: 'plan-standard' },
  { id: 'bc-2', name: 'БЦ Речной Порт', address: 'г. Москва, Ленинградское ш., 39', officesCount: 45, totalAreaSqm: 6200, planId: 'plan-basic' },
];

for (const bc of businessCenters) {
  const exists = db.prepare('SELECT id FROM business_centers WHERE id = ?').get(bc.id);
  if (exists) continue;
  db.prepare(`
    INSERT INTO business_centers (id, name, address, offices_count, total_area_sqm, plan_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(bc.id, bc.name, bc.address, bc.officesCount, bc.totalAreaSqm, bc.planId);
}

for (const u of users) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
  if (existing) continue;

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, company, role, office, floor, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(uuid(), u.email, bcrypt.hashSync(u.password, 10), u.fullName, u.company, u.role, u.office, u.floor);
}

// Миграция старых аккаунтов
db.exec("UPDATE users SET role='tenant' WHERE role='resident'");
db.exec("DELETE FROM users WHERE email IN ('resident@pass24.local', 'resident2@pass24.local')");

Object.entries(settings.DEFAULTS).forEach(([key, value]) => {
  settings.set(key, value);
});

const tenant1 = db.prepare("SELECT id FROM users WHERE email = 'tenant@pass24.local'").get();
const tenant2 = db.prepare("SELECT id FROM users WHERE email = 'tenant2@pass24.local'").get();

const officeList = [
  { id: 'off-401', number: '401', floor: '4', areaSqm: 85, company: 'ООО «ТехноСофт»', tenantId: tenant1?.id },
  { id: 'off-215', number: '215', floor: '2', areaSqm: 42, company: 'ИП Сидоров', tenantId: tenant2?.id },
  { id: 'off-102', number: '102', floor: '1', areaSqm: 120, company: 'ООО «ЮрКонсалт»', tenantId: null },
  { id: 'off-503', number: '503', floor: '5', areaSqm: 200, company: 'ООО «МедиаГруп»', tenantId: null },
];

for (const o of officeList) {
  const exists = db.prepare('SELECT id FROM offices WHERE id = ?').get(o.id);
  if (exists) continue;
  db.prepare('INSERT INTO offices (id, number, floor, area_sqm, company, tenant_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(o.id, o.number, o.floor, o.areaSqm, o.company, o.tenantId || null);
}

const tenant = db.prepare("SELECT id, office, floor, company FROM users WHERE email = 'tenant@pass24.local'").get();
const security = db.prepare("SELECT id FROM users WHERE email = 'security@pass24.local'").get();
const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

if (tenant && security) {
  const samplePasses = [
    {
      id: uuid(), passNumber: `${today.replace(/-/g, '')}-0001`,
      createdBy: tenant.id, visitorName: 'Козлов Алексей', visitorPhone: '+7 900 111-22-33',
      companyName: tenant.company, visitPurpose: 'Встреча с директором',
      passType: 'visitor', visitDate: today, visitTimeFrom: '10:00', visitTimeTo: '18:00',
      office: tenant.office, floor: tenant.floor, status: 'approved', approvedBy: security.id,
    },
    {
      id: uuid(), passNumber: `${today.replace(/-/g, '')}-0002`,
      createdBy: tenant.id, visitorName: 'Морозов Игорь', visitorPhone: '+7 900 444-55-66',
      companyName: 'ООО «Партнёр»', visitPurpose: 'Переговоры',
      passType: 'parking', vehiclePlate: 'А123ВС777', vehicleModel: 'Mercedes E-class',
      visitDate: today, visitTimeFrom: '14:00', visitTimeTo: '16:00',
      office: tenant.office, floor: tenant.floor, status: 'pending',
    },
    {
      id: uuid(), passNumber: `${tomorrow.replace(/-/g, '')}-0001`,
      createdBy: tenant.id, visitorName: 'Курьер СДЭК', visitorPhone: '+7 900 777-88-99',
      companyName: tenant.company, visitPurpose: 'Доставка документов',
      passType: 'delivery', visitDate: tomorrow, visitTimeFrom: '12:00', visitTimeTo: '13:00',
      office: tenant.office, floor: tenant.floor, status: 'pending',
      comment: 'Документы для подписания',
    },
  ];

  for (const p of samplePasses) {
    const exists = db.prepare('SELECT id FROM passes WHERE pass_number = ?').get(p.passNumber);
    if (exists) continue;

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO passes (
        id, pass_number, created_by, visitor_name, visitor_phone, company_name, visit_purpose,
        pass_type, vehicle_plate, vehicle_model, visit_date, visit_time_from, visit_time_to,
        office, floor, comment, status, approved_by, approved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      p.id, p.passNumber, p.createdBy, p.visitorName, p.visitorPhone || null,
      p.companyName || null, p.visitPurpose || null, p.passType,
      p.vehiclePlate || null, p.vehicleModel || null, p.visitDate,
      p.visitTimeFrom || null, p.visitTimeTo || null, p.office, p.floor || null,
      p.comment || null, p.status, p.approvedBy || null, p.approvedBy ? now : null,
    );
  }
}

console.log('Done! Test accounts:');
console.log('  admin@pass24.local / admin123');
console.log('  security@pass24.local / security123');
console.log('  tenant@pass24.local / tenant123');