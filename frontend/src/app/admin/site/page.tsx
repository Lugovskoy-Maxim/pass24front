'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Globe, ImageIcon, Mail, Phone, RotateCcw, Trash2, Type, Upload } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { IconPickerField } from '@/components/IconPickerField';
import { SiteBrand } from '@/components/SiteBrand';
import { SelectWrap } from '@/components/FormField';
import { UiLabelsEditor } from '@/components/UiLabelsEditor';
import { useToast } from '@/components/Toast';
import { api, SiteSettings, getErrorMessage } from '@/lib/api';
import { PageError } from '@/components/PageError';
import { invalidateConfigCache } from '@/hooks/useConfig';
import { MSTYLE_BRAND_DEFAULTS, resolveBrand } from '@/lib/brand-defaults';
import { mergeUiLabels, UiLabels } from '@/lib/ui-labels';

const MAX_ICON_BYTES = 80 * 1024;

type Tab = 'brand' | 'labels';

function normalizeSettings(s: SiteSettings): SiteSettings {
  return {
    ...s,
    brandMarkType: s.brandMarkType === 'text' ? 'text' : 'image',
    brandMarkText: s.brandMarkText?.trim() || MSTYLE_BRAND_DEFAULTS.brandMarkText,
    brandShowName: s.brandShowName !== false,
    brandNameBeforeMark: s.brandNameBeforeMark !== false,
    uiIconSelectChevron: s.uiIconSelectChevron?.trim() || MSTYLE_BRAND_DEFAULTS.uiIconSelectChevron,
  };
}

export default function AdminSiteSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);
  const [labels, setLabels] = useState<UiLabels>(mergeUiLabels());
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('brand');

  const load = () => {
    setLoadError('');
    setLoadErrorCause(null);
    api.admin.getSiteSettings()
      .then(({ settings: s }) => {
        setSettings(normalizeSettings(s));
        setLabels(mergeUiLabels(s.uiLabels));
      })
      .catch((err) => {
        setLoadErrorCause(err);
        setLoadError(getErrorMessage(err, 'Ошибка загрузки'));
      });
  };

  useEffect(() => {
    load();
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
      setSettings(normalizeSettings(updated));
      setLabels(mergeUiLabels(updated.uiLabels));
      invalidateConfigCache();
      toast('Настройки сохранены', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <AdminLayout title="Базовые настройки">
        <PageError message={loadError} error={loadErrorCause} onRetry={load} retryLabel="Повторить" />
      </AdminLayout>
    );
  }

  if (!settings) {
    return (
      <AdminLayout title="Базовые настройки">
        <div className="animate-pulse text-[var(--muted)]">Загрузка...</div>
      </AdminLayout>
    );
  }

  const previewBrand = resolveBrand(settings);
  const previewConfig = {
    siteName: settings.siteName,
    siteIcon: settings.siteIcon,
    siteTagline: settings.siteTagline,
    brandMarkType: settings.brandMarkType,
    brandMarkText: settings.brandMarkText,
    brandShowName: settings.brandShowName,
    brandNameBeforeMark: settings.brandNameBeforeMark,
    uiIconSelectChevron: settings.uiIconSelectChevron,
    sitePhone: previewBrand.sitePhone,
    siteEmail: previewBrand.siteEmail,
    businessCenterName: previewBrand.siteName,
    workingHoursFrom: '08:00',
    workingHoursTo: '20:00',
    contactPhone: settings.sitePhone,
    contactEmail: settings.siteEmail,
    receptionFloor: '1',
    uiLabels: labels as unknown as Record<string, unknown>,
  };

  return (
    <AdminLayout title="Базовые настройки">
      <p className="text-[var(--muted)] -mt-4 mb-6">
        Бренд портала меняется без пересборки: сохраните настройки — изменения появятся сразу у всех пользователей
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
                  placeholder={MSTYLE_BRAND_DEFAULTS.siteName}
                  required
                />
              </div>

              <div>
                <label className="label">Подзаголовок</label>
                <input
                  className="input"
                  value={settings.siteTagline}
                  onChange={(e) => setSettings({ ...settings, siteTagline: e.target.value })}
                  placeholder={MSTYLE_BRAND_DEFAULTS.siteTagline}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3 pt-1 border-t border-[var(--border)]">
                <label className="flex items-center gap-2 text-sm cursor-pointer sm:col-span-2">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={settings.brandShowName}
                    onChange={(e) => setSettings({ ...settings, brandShowName: e.target.checked })}
                  />
                  Показывать название сайта
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer sm:col-span-2">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={settings.brandNameBeforeMark}
                    onChange={(e) => setSettings({ ...settings, brandNameBeforeMark: e.target.checked })}
                  />
                  Название перед знаком (логотипом)
                </label>
              </div>

              <div>
                <label className="label">Знак бренда</label>
                <SelectWrap>
                  <select
                    className="input"
                    value={settings.brandMarkType}
                    onChange={(e) => setSettings({
                      ...settings,
                      brandMarkType: e.target.value as SiteSettings['brandMarkType'],
                    })}
                  >
                    <option value="image">Картинка (логотип)</option>
                    <option value="text">Текст (как иконка)</option>
                  </select>
                </SelectWrap>
              </div>

              {settings.brandMarkType === 'text' ? (
                <div>
                  <label className="label">Текст знака</label>
                  <input
                    className="input"
                    value={settings.brandMarkText}
                    maxLength={8}
                    onChange={(e) => setSettings({ ...settings, brandMarkText: e.target.value })}
                    placeholder={MSTYLE_BRAND_DEFAULTS.brandMarkText}
                  />
                  <p className="text-xs text-[var(--muted)] mt-1">До 8 символов, например «M» или «BC»</p>
                </div>
              ) : (
                <div>
                  <label className="label">Картинка логотипа</label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      className="input flex-1"
                      value={settings.siteIcon.startsWith('data:') ? '' : settings.siteIcon}
                      onChange={(e) => setSettings({ ...settings, siteIcon: e.target.value })}
                      placeholder={MSTYLE_BRAND_DEFAULTS.siteIcon}
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
                  <p className="text-xs text-[var(--muted)] mt-1">
                    Ссылка, файл до 80 КБ или путь вида /brand/mstyle-logo.svg
                  </p>
                </div>
              )}

              <IconPickerField
                label="Иконка выпадающих списков"
                value={settings.uiIconSelectChevron}
                onChange={(uiIconSelectChevron) => setSettings({ ...settings, uiIconSelectChevron })}
                hint="Иконки из библиотеки Lucide. Применяется ко всем select на сайте."
              />

              <div>
                <label className="label flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  Телефон
                </label>
                <input
                  className="input"
                  value={settings.sitePhone}
                  onChange={(e) => setSettings({ ...settings, sitePhone: e.target.value })}
                  placeholder={MSTYLE_BRAND_DEFAULTS.sitePhone}
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
                  placeholder={MSTYLE_BRAND_DEFAULTS.siteEmail}
                />
              </div>
            </div>

            <div className="card p-5 h-fit space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--muted)]">
                <ImageIcon className="w-4 h-4" />
                Предпросмотр
              </div>
              <SiteBrand config={previewConfig} size="lg" showTagline layout="column" />
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

        <div className="mt-6 max-w-4xl flex flex-wrap gap-3">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Сохранение...' : labels.buttons.save}
          </button>
          {tab === 'brand' && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (!settings) return;
                setSettings({
                  ...settings,
                  siteName: MSTYLE_BRAND_DEFAULTS.siteName,
                  siteIcon: MSTYLE_BRAND_DEFAULTS.siteIcon,
                  siteTagline: MSTYLE_BRAND_DEFAULTS.siteTagline,
                  sitePhone: MSTYLE_BRAND_DEFAULTS.sitePhone,
                  siteEmail: MSTYLE_BRAND_DEFAULTS.siteEmail,
                  brandMarkType: MSTYLE_BRAND_DEFAULTS.brandMarkType,
                  brandMarkText: MSTYLE_BRAND_DEFAULTS.brandMarkText,
                  brandShowName: MSTYLE_BRAND_DEFAULTS.brandShowName,
                  brandNameBeforeMark: MSTYLE_BRAND_DEFAULTS.brandNameBeforeMark,
                  uiIconSelectChevron: MSTYLE_BRAND_DEFAULTS.uiIconSelectChevron,
                });
                toast('Подставлены значения M-STYLE. Нажмите «Сохранить» для применения.', 'info');
              }}
            >
              <RotateCcw className="w-4 h-4" />
              Сбросить к M-STYLE
            </button>
          )}
        </div>
      </form>
    </AdminLayout>
  );
}