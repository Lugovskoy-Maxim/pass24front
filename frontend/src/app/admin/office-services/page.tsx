'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { OfficeCategoryBadge } from '@/components/OfficeCategoryBadge';
import {
  OfficeServiceRuleEditor,
  emptyServiceRule,
} from '@/components/OfficeServiceRuleEditor';
import { api, BusinessCenter, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  OfficeCategory,
  PriceService,
  officeServices,
  servicePrice,
} from '@/lib/office-services';

const freshService = (): PriceService => ({
  id: '',
  name: '',
  description: '',
  propertyId: null,
  active: true,
  order: 0,
  rules: [],
  bookingRoomIds: [],
  revision: 0,
});
export default function OfficePricesPage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<OfficeCategory[]>([]);
  const [services, setServices] = useState<PriceService[]>([]);
  const [centers, setCenters] = useState<BusinessCenter[]>([]);
  const [draft, setDraft] = useState<PriceService | null>(null);
  const [roomIdsText, setRoomIdsText] = useState('');
  function editService(value: PriceService) {
    setDraft(value);
    setRoomIdsText(value.bookingRoomIds.join(', '));
  }
  const [categoryDraft, setCategoryDraft] = useState<OfficeCategory | null>(
    null,
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    try {
      const [c, p, b] = await Promise.all([
        officeServices.categories(),
        officeServices.prices(),
        api.admin.getBusinessCenters(),
      ]);
      setCategories(c.categories);
      setServices(p.services);
      setCenters(b.businessCenters);
      setLoaded(true);
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      if (roomIdsText.trim() && !/^\d+(\s*,\s*\d+)*$/.test(roomIdsText.trim()))
        throw new Error('Введите номера переговорных через запятую');
      const { id, ...value } = {
        ...draft,
        bookingRoomIds: roomIdsText.trim()
          ? roomIdsText.split(',').map((id) => Number(id.trim()))
          : [],
      };
      await officeServices.savePrice(value, id || undefined);
      setDraft(null);
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveCategory(e: FormEvent) {
    e.preventDefault();
    if (!categoryDraft) return;
    setBusy(true);
    setError('');
    try {
      await officeServices.saveCategory(categoryDraft);
      setCategoryDraft(null);
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminLayout title="Прайс и категории офисов">
      <p className="text-sm text-[var(--muted)] mb-5">
        Каждая услуга и её условия для каждого типа офиса заполняются вручную.
        Если условия категории не заданы, услуга для неё не отображается.
      </p>
      {error && (
        <p className="card p-4 mb-4 text-[var(--danger)]" role="alert">
          {error}
          <button
            className="btn btn-secondary ml-3"
            onClick={() => void load()}
          >
            Обновить
          </button>
        </p>
      )}
      <section className="card p-5 mb-5 space-y-4">
        <h2 className="font-semibold">Категории и цвета</h2>
        <div className="flex flex-wrap gap-3">
          {categories.map((c) => (
            <button
              key={c.code}
              type="button"
              disabled={user?.role !== 'admin'}
              onClick={() => setCategoryDraft({ ...c })}
            >
              <OfficeCategoryBadge category={c} />
            </button>
          ))}
          {user?.role === 'admin' && (
            <button
              className="btn btn-secondary text-sm"
              onClick={() =>
                setCategoryDraft({
                  code: '',
                  name: '',
                  color: '#64748b',
                  order: categories.length,
                })
              }
            >
              Добавить категорию
            </button>
          )}
        </div>
        {categoryDraft && (
          <form className="grid sm:grid-cols-2 gap-3" onSubmit={saveCategory}>
            <label>
              Код
              <input
                className="input"
                required
                value={categoryDraft.code}
                onChange={(e) =>
                  setCategoryDraft({ ...categoryDraft, code: e.target.value })
                }
              />
            </label>
            <label>
              Название
              <input
                className="input"
                required
                value={categoryDraft.name}
                onChange={(e) =>
                  setCategoryDraft({ ...categoryDraft, name: e.target.value })
                }
              />
            </label>
            <label>
              Цвет
              <input
                className="input h-11"
                type="color"
                value={categoryDraft.color}
                onChange={(e) =>
                  setCategoryDraft({ ...categoryDraft, color: e.target.value })
                }
              />
            </label>
            <label>
              Порядок
              <input
                className="input"
                type="number"
                min={0}
                max={1000}
                value={categoryDraft.order}
                onChange={(e) =>
                  setCategoryDraft({
                    ...categoryDraft,
                    order: Number(e.target.value),
                  })
                }
              />
            </label>
            <div className="flex gap-2">
              <button className="btn btn-primary" disabled={busy}>
                Сохранить
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCategoryDraft(null)}
              >
                Отмена
              </button>
            </div>
          </form>
        )}
      </section>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-lg">Услуги</h2>
        <button
          className="btn btn-primary"
          onClick={() =>
            editService({
              ...freshService(),
              propertyId:
                user?.role === 'admin' ? null : centers[0]?.id || null,
            })
          }
        >
          Добавить услугу
        </button>
      </div>
      {draft && (
        <form className="card p-5 mb-5 space-y-4" onSubmit={save}>
          <h3 className="font-semibold">
            {draft.id ? 'Редактирование услуги' : 'Новая услуга'}
          </h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <label>
              Название
              <input
                className="input mt-1"
                required
                maxLength={160}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              Доступна в БЦ
              <select
                className="input mt-1"
                value={draft.propertyId || ''}
                onChange={(e) =>
                  setDraft({ ...draft, propertyId: e.target.value || null })
                }
              >
                {user?.role === 'admin' && <option value="">Все БЦ</option>}
                {centers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              Описание
              <textarea
                className="input mt-1"
                rows={2}
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
            <label>
              Порядок
              <input
                className="input mt-1"
                type="number"
                min={0}
                max={1000}
                value={draft.order}
                onChange={(e) =>
                  setDraft({ ...draft, order: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Номера переговорных в каталоге (через запятую)
              <input
                className="input mt-1"
                value={roomIdsText}
                onChange={(e) => setRoomIdsText(e.target.value)}
              />
            </label>
          </div>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            />
            Услуга активна
          </label>
          <div className="space-y-3">
            {categories.map((c) => {
              const rule = draft.rules.find((r) => r.categoryCode === c.code);
              return (
                <div
                  key={c.code}
                  className="rounded-lg border border-[var(--border)] p-4 space-y-3"
                >
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={!!rule}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          rules: e.target.checked
                            ? [...draft.rules, emptyServiceRule(c.code)]
                            : draft.rules.filter(
                                (r) => r.categoryCode !== c.code,
                              ),
                        })
                      }
                    />
                    <OfficeCategoryBadge category={c} />
                    <span className="text-sm">Настроить условия</span>
                  </label>
                  {rule && (
                    <OfficeServiceRuleEditor
                      value={rule}
                      onChange={(next) =>
                        setDraft({
                          ...draft,
                          rules: draft.rules.map((r) =>
                            r.categoryCode === c.code ? next : r,
                          ),
                        })
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-3">
            <button className="btn btn-primary" disabled={busy}>
              Сохранить услугу
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDraft(null)}
            >
              Отмена
            </button>
          </div>
        </form>
      )}
      {!loaded && !error ? (
        <p>Загрузка…</p>
      ) : services.length === 0 ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          Прайс пока пуст. Добавьте услуги и заполните условия категорий.
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {services.map((s) => (
            <article className="card p-5 space-y-3" key={s.id}>
              <div className="flex justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    {s.name}
                    {!s.active && ' · Архив'}
                  </h3>
                  <p className="text-xs text-[var(--muted)]">
                    {s.propertyId
                      ? centers.find((b) => b.id === s.propertyId)?.name || 'БЦ'
                      : 'Все БЦ'}
                  </p>
                </div>
                <button
                  className="btn btn-secondary text-sm"
                  disabled={user?.role !== 'admin' && !s.propertyId}
                  onClick={() => editService(structuredClone(s))}
                >
                  Изменить
                </button>
              </div>
              {s.description && <p className="text-sm">{s.description}</p>}
              {s.rules.map((r) => (
                <div
                  className="flex flex-wrap justify-between gap-2 text-sm"
                  key={r.categoryCode}
                >
                  <OfficeCategoryBadge
                    category={categories.find((c) => c.code === r.categoryCode)}
                  />
                  <span>
                    {servicePrice(r)}
                    {!r.show ? ' · Скрыто' : ''}
                    {!r.orderable ? ' · Без заказа' : ''}
                  </span>
                  {r.conditions && (
                    <p className="w-full text-[var(--muted)]">{r.conditions}</p>
                  )}
                </div>
              ))}
            </article>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
