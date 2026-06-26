'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Globe, ImageIcon, Mail, Phone, Trash2, Type, Upload } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { SiteBrand } from '@/components/SiteBrand';
import { UiLabelsEditor } from '@/components/UiLabelsEditor';
import { useToast } from '@/components/Toast';
import { api, SiteSettings } from '@/lib/api';
import { invalidateConfigCache } from '@/hooks/useConfig';
import { mergeUiLabels, UiLabels } from '@/lib/ui-labels';

const MAX_ICON_BYTES = 80 * 1024;

type Tab = 'brand' | 'labels';

export default function AdminSiteSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [labels, setLabels] = useState<UiLabels>(mergeUiLabels());
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('brand');

  useEffect(() => {
    api.admin.getSiteSettings().then(({ settings: s }) => {
      setSettings(s);
      setLabels(mergeUiLabels(s.uiLabels));
    });
  }, []);

  const handleIconUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settings) return;

    if (!file.type.startsWith('image/')) {
      toast('Загрузите изображение (PNG, JPG, SVG)', 'error');
      return;
    }
    if (file.size > MAX_ICON_BYTES) {
      toast('Файл слишком большой. Максимум 80 КБ', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSettings({ ...settings, siteIcon: String(reader.result || '') });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const { settings: updated } = await api.admin.updateSiteSettings({
        ...settings,
        uiLabels: labels as unknown as Record<string, unknown>,
      });
      setSettings(updated);
      setLabels(mergeUiLabels(updated.uiLabels));
      invalidateConfigCache();
      toast('Настройки сохранены', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <AdminLayout title="Базовые настройки">
        <div className="animate-pulse text-[var(--muted)]">Загрузка...</div>
      </AdminLayout>
    );
  }

  const previewConfig = {
    siteName: settings.siteName,
    siteIcon: settings.siteIcon,
    siteTagline: settings.siteTagline,
    sitePhone: settings.sitePhone,
    siteEmail: settings.siteEmail,
    businessCenterName: settings.siteName,
    workingHoursFrom: '08:00',
    workingHoursTo: '20:00',
    contactPhone: settings.sitePhone,
    contactEmail: settings.siteEmail,
    receptionFloor: '1',
    maxPassesPerDay: 200,
    uiLabels: labels as unknown as Record<string, unknown>,
  };

  return (
    <AdminLayout title="Базовые настройки">
      <p className="text-[var(--muted)] -mt-4 mb-6">
        Бренд портала, названия кнопок, статусов и подписей на карточках пропусков
      </p>

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          type="button"
          className={`btn text-sm ${tab === 'brand' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('brand')}
        >
          <Globe className="w-4 h-4" />
          Бренд и контакты
        </button>
        <button
          type="button"
          className={`btn text-sm ${tab === 'labels' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('labels')}
        >
          <Type className="w-4 h-4" />
          Названия и кнопки
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {tab === 'brand' && (
          <div className="grid lg:grid-cols-[1fr_280px] gap-6 max-w-4xl">
            <div className="card p-6 space-y-5">
              <div>
                <label className="label">Название сайта</label>
                <input
                  className="input"
                  value={settings.siteName}
                  onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                  placeholder="PASS24"
                  required
                />
              </div>

              <div>
                <label className="label">Подзаголовок</label>
                <input
                  className="input"
                  value={settings.siteTagline}
                  onChange={(e) => setSettings({ ...settings, siteTagline: e.target.value })}
                  placeholder="Пропуска для арендаторов бизнес-центра"
                />
              </div>

              <div>
                <label className="label">Иконка / логотип</label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    className="input flex-1"
                    value={settings.siteIcon.startsWith('data:') ? '' : settings.siteIcon}
                    onChange={(e) => setSettings({ ...settings, siteIcon: e.target.value })}
                    placeholder="https://example.com/logo.png"
                  />
                  <label className="btn btn-secondary cursor-pointer shrink-0">
                    <Upload className="w-4 h-4" />
                    Загрузить
                    <input type="file" accept="image/*" className="hidden" onChange={handleIconUpload} />
                  </label>
                  {settings.siteIcon && (
                    <button
                      type="button"
                      className="btn btn-secondary shrink-0"
                      onClick={() => setSettings({ ...settings, siteIcon: '' })}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-[var(--muted)] mt-1">Ссылка на изображение или файл до 80 КБ</p>
              </div>

              <div>
                <label className="label flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  Телефон
                </label>
                <input
                  className="input"
                  value={settings.sitePhone}
                  onChange={(e) => setSettings({ ...settings, sitePhone: e.target.value })}
                  placeholder="+7 (495) 123-45-67"
                />
              </div>

              <div>
                <label className="label flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  Email
                </label>
                <input
                  className="input"
                  type="email"
                  value={settings.siteEmail}
                  onChange={(e) => setSettings({ ...settings, siteEmail: e.target.value })}
                  placeholder="info@company.ru"
                />
              </div>
            </div>

            <div className="card p-5 h-fit space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--muted)]">
                <ImageIcon className="w-4 h-4" />
                Предпросмотр
              </div>
              <SiteBrand config={previewConfig} size="lg" showTagline />
              <div className="pt-3 border-t border-[var(--border)] space-y-2 text-sm">
                {settings.sitePhone && (
                  <a href={`tel:${settings.sitePhone}`} className="flex items-center gap-2 text-[var(--primary)] hover:underline">
                    <Phone className="w-4 h-4" />
                    {settings.sitePhone}
                  </a>
                )}
                {settings.siteEmail && (
                  <a href={`mailto:${settings.siteEmail}`} className="flex items-center gap-2 text-[var(--primary)] hover:underline">
                    <Mail className="w-4 h-4" />
                    {settings.siteEmail}
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'labels' && (
          <div className="max-w-4xl">
            <UiLabelsEditor labels={labels} onChange={setLabels} />
          </div>
        )}

        <div className="mt-6 max-w-4xl">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Сохранение...' : labels.buttons.save}
          </button>
        </div>
      </form>
    </AdminLayout>
  );
}