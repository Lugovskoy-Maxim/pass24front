'use client';

import { useEffect, useState } from 'react';
import { Building2, Check } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { api, PricingPlan, Complex } from '@/lib/api';

function formatPrice(n: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);
}

export default function AdminPricingPage() {
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [complexes, setComplexes] = useState<Complex[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [price, setPrice] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = () => {
    Promise.all([api.admin.getPricing(), api.admin.getComplexes()])
      .then(([p, c]) => { setPlans(p.plans); setComplexes(c.complexes); });
  };

  useEffect(() => { load(); }, []);

  const startEdit = (plan: PricingPlan) => {
    setEditId(plan.id);
    setPrice(plan.priceMonthly);
  };

  const savePrice = async (id: string) => {
    setSaving(true);
    try {
      await api.admin.updatePricing(id, { priceMonthly: price });
      setEditId(null);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (plan: PricingPlan) => {
    await api.admin.updatePricing(plan.id, { isActive: !plan.isActive });
    load();
  };

  return (
    <AdminLayout title="Тарифы и цены">
      <p className="text-[var(--muted)] -mt-4 mb-6">Официальная тарифная сетка PASS24 для жилых комплексов</p>

      <div className="grid md:grid-cols-3 gap-4 mb-10">
        {plans.map((plan) => (
          <div key={plan.id} className={`card p-5 ${!plan.isActive ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between mb-3">
              <h2 className="text-lg font-bold">{plan.name}</h2>
              <button
                className={`text-xs px-2 py-0.5 rounded-full ${plan.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                onClick={() => toggleActive(plan)}
              >
                {plan.isActive ? 'Активен' : 'Отключён'}
              </button>
            </div>
            <p className="text-sm text-[var(--muted)] mb-4">{plan.description}</p>

            {editId === plan.id ? (
              <div className="flex gap-2 mb-4">
                <input className="input" type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
                <button className="btn btn-primary text-sm" disabled={saving} onClick={() => savePrice(plan.id)}>OK</button>
                <button className="btn btn-secondary text-sm" onClick={() => setEditId(null)}>×</button>
              </div>
            ) : (
              <div className="mb-4">
                <span className="text-2xl font-bold">{formatPrice(plan.priceMonthly)}</span>
                <span className="text-sm text-[var(--muted)]"> / мес</span>
                <button className="ml-2 text-xs text-[var(--primary)] hover:underline" onClick={() => startEdit(plan)}>изменить</button>
              </div>
            )}

            <p className="text-xs text-[var(--muted)] mb-3">до {plan.maxApartments.toLocaleString('ru')} квартир</p>
            <ul className="space-y-1.5">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Building2 className="w-5 h-5" />
        Подключённые ЖК
      </h2>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[var(--muted)]">
            <tr>
              <th className="text-left p-3 font-medium">Название</th>
              <th className="text-left p-3 font-medium hidden md:table-cell">Адрес</th>
              <th className="text-left p-3 font-medium">Квартир</th>
              <th className="text-left p-3 font-medium">Тариф</th>
              <th className="text-right p-3 font-medium">Стоимость</th>
            </tr>
          </thead>
          <tbody>
            {complexes.map((c) => (
              <tr key={c.id} className="border-t border-[var(--border)]">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3 hidden md:table-cell text-[var(--muted)]">{c.address}</td>
                <td className="p-3">{c.apartmentsCount}</td>
                <td className="p-3">{c.planName}</td>
                <td className="p-3 text-right font-medium">{formatPrice(c.priceMonthly)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}