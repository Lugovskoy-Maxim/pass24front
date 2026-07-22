'use client';

/**
 * Админка «Базовые настройки» (/admin/site).
 * Вкладки: бренд, цвета, UI labels, SMS-регистрация (только super-admin),
 * FAQ, инструкции помощи. После save — invalidateConfigCache().
 *
 * FAQ/guide: шаги и абзацы в форме — multiline text → textToLines при submit.
 * registration* поля PATCH только role=admin (бэкенд вырезает для bc_admin).
 */
import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import {
  ArrowDown, ArrowUp, BookOpen, CircleHelp, Globe, ImageIcon, Mail, MessageSquare, Palette, Phone,
  Plus, RotateCcw, Trash2, Type, Upload,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { AdminLayout } from '@/components/AdminLayout';
import { IconPickerField } from '@/components/IconPickerField';
import { SiteBrand } from '@/components/SiteBrand';
import { SelectWrap } from '@/components/FormField';
import { UiLabelsEditor } from '@/components/UiLabelsEditor';
import { useToast } from '@/components/Toast';
import { api, FaqItem, HelpGuideSection, SiteSettings, getErrorMessage } from '@/lib/api';
import { PageError } from '@/components/PageError';
import { invalidateConfigCache } from '@/hooks/useConfig';
import { MSTYLE_BRAND_DEFAULTS, resolveBrand } from '@/lib/brand-defaults';
import {
  HELP_FAQ_ITEMS,
  HELP_GUIDE_SECTIONS,
  linesToText,
  resolveFaqItems,
  resolveGuideSections,
  textToLines,
} from '@/lib/help-faq-content';
import { THEME_COLOR_DEFAULTS } from '@/lib/theme-colors';
import { mergeUiLabels, UiLabels } from '@/lib/ui-labels';

const MAX_ICON_BYTES = 80 * 1024;
const MAX_FAQ_ITEMS = 50;
const MAX_GUIDE_SECTIONS = 40;

type Tab = 'brand' | 'colors' | 'labels' | 'registration' | 'faq' | 'guide';

/** Редактор: steps/paragraphs как многострочный текст, на API — string[]. */
type GuideSectionForm = {
  id: string;
  title: string;
  stepsText: string;
  paragraphsText: string;
};

function iconInputValue(value: string): string {
  return value.startsWith('data:') ? '' : value;
}

function newFaqId(): string {
  return `faq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function newGuideId(): string {
  return `guide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function toGuideForm(sections: HelpGuideSection[]): GuideSectionForm[] {
  return sections.map((s) => ({
    id: s.id,
    title: s.title,
    stepsText: linesToText(s.steps),
    paragraphsText: linesToText(s.paragraphs),
  }));
}

function fromGuideForm(forms: GuideSectionForm[]): HelpGuideSection[] {
  return forms
    .map((s, index) => ({
      id: s.id?.trim() || newGuideId() || `guide-${index + 1}`,
      title: s.title.trim(),
      steps: textToLines(s.stepsText),
      paragraphs: textToLines(s.paragraphsText),
    }))
    .filter((s) => s.title && (s.steps.length > 0 || s.paragraphs.length > 0));
}

function normalizeSettings(s: SiteSettings): SiteSettings {
  const legacy = s.siteIcon?.trim() || '';
  return {
    ...s,
    appVersion: (s.appVersion ?? '').toString().trim().slice(0, 32),
    siteIconLight: s.siteIconLight?.trim() || legacy || MSTYLE_BRAND_DEFAULTS.siteIconLight,
    siteIconDark: s.siteIconDark?.trim() || legacy || MSTYLE_BRAND_DEFAULTS.siteIconDark,
    brandMarkType: s.brandMarkType === 'text' ? 'text' : 'image',
    brandMarkText: s.brandMarkText?.trim() || MSTYLE_BRAND_DEFAULTS.brandMarkText,
    brandShowName: s.brandShowName !== false,
    brandNameBeforeMark: s.brandNameBeforeMark !== false,
    uiIconSelectChevron: s.uiIconSelectChevron?.trim() || MSTYLE_BRAND_DEFAULTS.uiIconSelectChevron,
    themePrimary: s.themePrimary?.trim() || MSTYLE_BRAND_DEFAULTS.themePrimary,
    themePrimaryHover: s.themePrimaryHover?.trim() || MSTYLE_BRAND_DEFAULTS.themePrimaryHover,
    smsRegistrationEnabled: s.smsRegistrationEnabled !== false,
    smsRegistrationDisabledMessage: s.smsRegistrationDisabledMessage?.trim()
      || MSTYLE_BRAND_DEFAULTS.smsRegistrationDisabledMessage,
    smsRegistrationCodeText: s.smsRegistrationCodeText?.includes('{code}')
      ? s.smsRegistrationCodeText.trim()
      : MSTYLE_BRAND_DEFAULTS.smsRegistrationCodeText,
    faqItems: resolveFaqItems(s.faqItems).map((item) => ({ ...item })),
    helpGuideSections: resolveGuideSections(s.helpGuideSections).map((item) => ({
      ...item,
      steps: [...(item.steps || [])],
      paragraphs: [...(item.paragraphs || [])],
    })),
  };
}

export default function AdminSiteSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = user?.role === 'admin';
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [guideForms, setGuideForms] = useState<GuideSectionForm[]>([]);
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
        const normalized = normalizeSettings(s);
        setSettings(normalized);
        setGuideForms(toGuideForm(normalized.helpGuideSections || []));
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

  const handleIconUpload = (field: 'siteIconLight' | 'siteIconDark') => (e: ChangeEvent<HTMLInputElement>) => {
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
      const value = String(reader.result || '');
      setSettings({
        ...settings,
        [field]: value,
        ...(field === 'siteIconLight' ? { siteIcon: value } : {}),
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const updateFaqItems = (faqItems: FaqItem[]) => {
    if (!settings) return;
    setSettings({ ...settings, faqItems });
  };

  const addFaqItem = () => {
    if (!settings) return;
    const items = settings.faqItems || [];
    if (items.length >= MAX_FAQ_ITEMS) {
      toast(`Не больше ${MAX_FAQ_ITEMS} вопросов`, 'error');
      return;
    }
    updateFaqItems([
      ...items,
      { id: newFaqId(), question: '', answer: '' },
    ]);
  };

  const updateFaqItem = (index: number, patch: Partial<FaqItem>) => {
    if (!settings?.faqItems) return;
    updateFaqItems(
      settings.faqItems.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  };

  const removeFaqItem = (index: number) => {
    if (!settings?.faqItems) return;
    updateFaqItems(settings.faqItems.filter((_, i) => i !== index));
  };

  const moveFaqItem = (index: number, direction: -1 | 1) => {
    if (!settings?.faqItems) return;
    const next = index + direction;
    if (next < 0 || next >= settings.faqItems.length) return;
    const items = [...settings.faqItems];
    const [row] = items.splice(index, 1);
    items.splice(next, 0, row);
    updateFaqItems(items);
  };

  const resetFaqDefaults = () => {
    updateFaqItems(HELP_FAQ_ITEMS.map((item) => ({ ...item })));
    toast('Загружены стандартные вопросы — не забудьте сохранить', 'info');
  };

  const addGuideSection = () => {
    if (guideForms.length >= MAX_GUIDE_SECTIONS) {
      toast(`Не больше ${MAX_GUIDE_SECTIONS} разделов`, 'error');
      return;
    }
    setGuideForms([
      ...guideForms,
      { id: newGuideId(), title: '', stepsText: '', paragraphsText: '' },
    ]);
  };

  const updateGuideForm = (index: number, patch: Partial<GuideSectionForm>) => {
    setGuideForms(guideForms.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const removeGuideSection = (index: number) => {
    setGuideForms(guideForms.filter((_, i) => i !== index));
  };

  const moveGuideSection = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= guideForms.length) return;
    const items = [...guideForms];
    const [row] = items.splice(index, 1);
    items.splice(next, 0, row);
    setGuideForms(items);
  };

  const resetGuideDefaults = () => {
    setGuideForms(toGuideForm(HELP_GUIDE_SECTIONS));
    toast('Загружены стандартные инструкции — не забудьте сохранить', 'info');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    if (tab === 'faq') {
      const cleaned = (settings.faqItems || [])
        .map((item) => ({
          id: item.id?.trim() || newFaqId(),
          question: item.question.trim(),
          answer: item.answer.trim(),
        }))
        .filter((item) => item.question || item.answer);
      const incomplete = cleaned.find((item) => !item.question || !item.answer);
      if (incomplete) {
        toast('Заполните и вопрос, и ответ у каждой записи (или удалите пустые)', 'error');
        return;
      }
      if (!cleaned.length) {
        toast('Добавьте хотя бы один вопрос и ответ', 'error');
        return;
      }
    }

    if (tab === 'guide') {
      const incomplete = guideForms.find((item) => {
        const hasTitle = !!item.title.trim();
        const hasBody = textToLines(item.stepsText).length > 0 || textToLines(item.paragraphsText).length > 0;
        const empty = !hasTitle && !item.stepsText.trim() && !item.paragraphsText.trim();
        if (empty) return false;
        return !hasTitle || !hasBody;
      });
      if (incomplete) {
        toast('У каждого раздела укажите заголовок и хотя бы один шаг или абзац (или удалите пустые)', 'error');
        return;
      }
      if (!fromGuideForm(guideForms).length) {
        toast('Добавьте хотя бы один раздел инструкций', 'error');
        return;
      }
    }

    setSaving(true);
    try {
      const payloadFaq = (settings.faqItems || [])
        .map((item) => ({
          id: item.id?.trim() || newFaqId(),
          question: item.question.trim(),
          answer: item.answer.trim(),
        }))
        .filter((item) => item.question && item.answer);

      const payloadGuide = fromGuideForm(guideForms);

      const { settings: updated } = await api.admin.updateSiteSettings({
        ...settings,
        faqItems: payloadFaq.length ? payloadFaq : HELP_FAQ_ITEMS.map((item) => ({ ...item })),
        helpGuideSections: payloadGuide.length
          ? payloadGuide
          : HELP_GUIDE_SECTIONS.map((item) => ({
              id: item.id,
              title: item.title,
              steps: item.steps || [],
              paragraphs: item.paragraphs || [],
            })),
        uiLabels: labels as unknown as Record<string, unknown>,
      });
      const normalized = normalizeSettings(updated);
      setSettings(normalized);
      setGuideForms(toGuideForm(normalized.helpGuideSections || []));
      setLabels(mergeUiLabels(updated.uiLabels));
      invalidateConfigCache();
      toast('Настройки сохранены', 'success');
    } catch (err) {
      toast(getErrorMessage(err, 'Не удалось сохранить настройки'), 'error');
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
    siteIcon: settings.siteIconLight,
    siteIconLight: settings.siteIconLight,
    siteIconDark: settings.siteIconDark,
    siteTagline: settings.siteTagline,
    brandMarkType: settings.brandMarkType,
    brandMarkText: settings.brandMarkText,
    brandShowName: settings.brandShowName,
    brandNameBeforeMark: settings.brandNameBeforeMark,
    uiIconSelectChevron: settings.uiIconSelectChevron,
    themePrimary: settings.themePrimary,
    themePrimaryHover: settings.themePrimaryHover,
    sitePhone: previewBrand.sitePhone,
    siteEmail: previewBrand.siteEmail,
    businessCenterName: previewBrand.siteName,
    businessCenters: [],
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
          className={`btn text-sm ${tab === 'colors' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('colors')}
        >
          <Palette className="w-4 h-4" />
          Цветовая гамма
        </button>
        <button
          type="button"
          className={`btn text-sm ${tab === 'labels' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('labels')}
        >
          <Type className="w-4 h-4" />
          Тексты и плейсхолдеры
        </button>
        {isSuperAdmin && (
          <button
            type="button"
            className={`btn text-sm ${tab === 'registration' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('registration')}
          >
            <MessageSquare className="w-4 h-4" />
            Регистрация
          </button>
        )}
        <button
          type="button"
          className={`btn text-sm ${tab === 'faq' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('faq')}
        >
          <CircleHelp className="w-4 h-4" />
          Вопросы и ответы
        </button>
        <button
          type="button"
          className={`btn text-sm ${tab === 'guide' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('guide')}
        >
          <BookOpen className="w-4 h-4" />
          Инструкции
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
                <label className="label" htmlFor="appVersion">Версия сайта</label>
                <input
                  id="appVersion"
                  className="input"
                  value={settings.appVersion || ''}
                  onChange={(e) => setSettings({ ...settings, appVersion: e.target.value })}
                  placeholder="v.220726"
                  maxLength={32}
                />
                <p className="text-xs text-[var(--muted)] mt-1">
                  Показывается мелким шрифтом внизу страниц (например <span className="font-mono">v.220726</span>).
                  Оставьте пустым — подставится дата сборки фронтенда.
                </p>
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
                <div className="space-y-4">
                  <p className="text-xs text-[var(--muted)]">
                    Загрузите отдельные логотипы для светлой и тёмной темы — так знак будет одинаково читаем на любом фоне.
                  </p>
                  {([
                    {
                      field: 'siteIconLight' as const,
                      label: 'Логотип для светлой темы',
                      hint: 'Тёмный знак на светлом фоне',
                      placeholder: MSTYLE_BRAND_DEFAULTS.siteIconLight,
                    },
                    {
                      field: 'siteIconDark' as const,
                      label: 'Логотип для тёмной темы',
                      hint: 'Светлый знак на тёмном фоне',
                      placeholder: MSTYLE_BRAND_DEFAULTS.siteIconDark,
                    },
                  ]).map(({ field, label, hint, placeholder }) => (
                    <div key={field}>
                      <label className="label">{label}</label>
                      <p className="text-xs text-[var(--muted)] mb-2">{hint}</p>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          className="input flex-1"
                          value={iconInputValue(settings[field])}
                          onChange={(e) => setSettings({
                            ...settings,
                            [field]: e.target.value,
                            ...(field === 'siteIconLight' ? { siteIcon: e.target.value } : {}),
                          })}
                          placeholder={placeholder}
                        />
                        <label className="btn btn-secondary cursor-pointer shrink-0">
                          <Upload className="w-4 h-4" />
                          Загрузить
                          <input type="file" accept="image/*" className="hidden" onChange={handleIconUpload(field)} />
                        </label>
                        {settings[field] && (
                          <button
                            type="button"
                            className="btn btn-secondary shrink-0"
                            onClick={() => setSettings({
                              ...settings,
                              [field]: '',
                              ...(field === 'siteIconLight' ? { siteIcon: '' } : {}),
                            })}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-[var(--muted)]">
                    Ссылка, файл до 80 КБ или путь вида /brand/mstyle-logo-light.svg
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
              <div className="space-y-3">
                <div className="rounded-lg border border-[var(--border)] p-4 bg-[#f0efec]">
                  <div className="text-xs text-[var(--muted)] mb-2">Светлая тема</div>
                  <SiteBrand config={previewConfig} size="lg" showTagline layout="column" variant="light" />
                </div>
                <div className="rounded-lg border border-[var(--border)] p-4 bg-[#323232]">
                  <div className="text-xs text-[#a3a3a3] mb-2">Тёмная тема</div>
                  <SiteBrand config={previewConfig} size="lg" showTagline layout="column" variant="dark" />
                </div>
              </div>
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

        {tab === 'colors' && (
          <div className="grid lg:grid-cols-[1fr_280px] gap-6 max-w-4xl">
            <div className="card p-6 space-y-5">
              <p className="text-sm text-[var(--muted)]">
                Основной акцентный цвет кнопок, ссылок и активных элементов интерфейса
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Основной цвет</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      className="h-10 w-14 rounded border border-[var(--border)] bg-transparent cursor-pointer"
                      value={settings.themePrimary}
                      onChange={(e) => setSettings({ ...settings, themePrimary: e.target.value })}
                    />
                    <input
                      className="input font-mono text-sm flex-1"
                      value={settings.themePrimary}
                      onChange={(e) => setSettings({ ...settings, themePrimary: e.target.value })}
                      pattern="^#[0-9A-Fa-f]{6}$"
                      placeholder={THEME_COLOR_DEFAULTS.themePrimary}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Цвет при наведении</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      className="h-10 w-14 rounded border border-[var(--border)] bg-transparent cursor-pointer"
                      value={settings.themePrimaryHover}
                      onChange={(e) => setSettings({ ...settings, themePrimaryHover: e.target.value })}
                    />
                    <input
                      className="input font-mono text-sm flex-1"
                      value={settings.themePrimaryHover}
                      onChange={(e) => setSettings({ ...settings, themePrimaryHover: e.target.value })}
                      pattern="^#[0-9A-Fa-f]{6}$"
                      placeholder={THEME_COLOR_DEFAULTS.themePrimaryHover}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="card p-5 h-fit space-y-4">
              <div className="text-sm font-medium text-[var(--muted)]">Предпросмотр</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary text-sm"
                  style={{ background: settings.themePrimary, borderColor: settings.themePrimary }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = settings.themePrimaryHover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = settings.themePrimary; }}
                >
                  Кнопка
                </button>
                <span style={{ color: settings.themePrimary }} className="text-sm font-medium self-center">
                  Акцентный текст
                </span>
              </div>
            </div>
          </div>
        )}

        {tab === 'labels' && (
          <div className="max-w-4xl">
            <UiLabelsEditor labels={labels} onChange={setLabels} />
          </div>
        )}

        {tab === 'faq' && (
          <div className="card p-6 max-w-3xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold mb-1">Вопросы и ответы</h2>
                <p className="text-sm text-[var(--muted)]">
                  Эти записи показываются в кнопке «Помощь» (внизу справа) на вкладке «Вопросы».
                  Порядок в списке = порядок в панели помощи.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button type="button" className="btn btn-secondary text-sm" onClick={resetFaqDefaults}>
                  <RotateCcw className="w-4 h-4" />
                  Стандартные
                </button>
                <button type="button" className="btn btn-secondary text-sm" onClick={addFaqItem}>
                  <Plus className="w-4 h-4" />
                  Добавить
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {(settings.faqItems || []).map((item, index) => (
                <div
                  key={item.id || `row-${index}`}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      Вопрос {index + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="btn btn-secondary text-xs px-2 py-1"
                        disabled={index === 0}
                        onClick={() => moveFaqItem(index, -1)}
                        title="Выше"
                        aria-label="Переместить выше"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary text-xs px-2 py-1"
                        disabled={index >= (settings.faqItems?.length || 0) - 1}
                        onClick={() => moveFaqItem(index, 1)}
                        title="Ниже"
                        aria-label="Переместить ниже"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger text-xs px-2 py-1"
                        onClick={() => removeFaqItem(index)}
                        title="Удалить"
                        aria-label="Удалить вопрос"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor={`faq-q-${index}`}>Вопрос</label>
                    <input
                      id={`faq-q-${index}`}
                      className="input"
                      value={item.question}
                      onChange={(e) => updateFaqItem(index, { question: e.target.value })}
                      placeholder="Например: Как заказать пропуск в БЦ Добрынинский?"
                      maxLength={300}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`faq-a-${index}`}>Ответ</label>
                    <textarea
                      id={`faq-a-${index}`}
                      className="input min-h-[100px] resize-y"
                      value={item.answer}
                      onChange={(e) => updateFaqItem(index, { answer: e.target.value })}
                      placeholder="Краткий ответ для арендаторов M-STYLE / БЦ Добрынинский"
                      maxLength={2000}
                    />
                    <p className="text-xs text-[var(--muted)] mt-1">
                      {item.answer.length}/2000
                    </p>
                  </div>
                </div>
              ))}

              {!(settings.faqItems?.length) && (
                <div className="text-sm text-[var(--muted)] border border-dashed border-[var(--border)] rounded-lg p-6 text-center">
                  Список пуст. Нажмите «Добавить» или «Стандартные».
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'guide' && (
          <div className="card p-6 max-w-3xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold mb-1">Инструкции</h2>
                <p className="text-sm text-[var(--muted)]">
                  Разделы вкладки «Инструкции» в кнопке «Помощь». Каждый пункт шага или абзац — с новой строки.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button type="button" className="btn btn-secondary text-sm" onClick={resetGuideDefaults}>
                  <RotateCcw className="w-4 h-4" />
                  Стандартные
                </button>
                <button type="button" className="btn btn-secondary text-sm" onClick={addGuideSection}>
                  <Plus className="w-4 h-4" />
                  Добавить
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {guideForms.map((item, index) => (
                <div
                  key={item.id || `guide-${index}`}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      Раздел {index + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="btn btn-secondary text-xs px-2 py-1"
                        disabled={index === 0}
                        onClick={() => moveGuideSection(index, -1)}
                        title="Выше"
                        aria-label="Переместить выше"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary text-xs px-2 py-1"
                        disabled={index >= guideForms.length - 1}
                        onClick={() => moveGuideSection(index, 1)}
                        title="Ниже"
                        aria-label="Переместить ниже"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger text-xs px-2 py-1"
                        onClick={() => removeGuideSection(index)}
                        title="Удалить"
                        aria-label="Удалить раздел"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor={`guide-title-${index}`}>Заголовок</label>
                    <input
                      id={`guide-title-${index}`}
                      className="input"
                      value={item.title}
                      onChange={(e) => updateGuideForm(index, { title: e.target.value })}
                      placeholder="Например: Заказ пропуска в БЦ Добрынинский"
                      maxLength={200}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`guide-steps-${index}`}>
                      Шаги (по одному на строку)
                    </label>
                    <textarea
                      id={`guide-steps-${index}`}
                      className="input min-h-[110px] resize-y"
                      value={item.stepsText}
                      onChange={(e) => updateGuideForm(index, { stepsText: e.target.value })}
                      placeholder={'Раздел «Пропуска» → «Заказать пропуск».\nУкажите посетителя, офис ООО «М-СТИЛЬ ОФИС» и дату визита в БЦ Добрынинский.'}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`guide-p-${index}`}>
                      Абзацы (по одному на строку)
                    </label>
                    <textarea
                      id={`guide-p-${index}`}
                      className="input min-h-[80px] resize-y"
                      value={item.paragraphsText}
                      onChange={(e) => updateGuideForm(index, { paragraphsText: e.target.value })}
                      placeholder="Например: Пропуск действует только на дату визита в БЦ Добрынинский или БЦ Добрынинский-2."
                    />
                    <p className="text-xs text-[var(--muted)] mt-1">
                      Нужен хотя бы один шаг или абзац. Шаги в панели помощи показываются нумерованным списком.
                    </p>
                  </div>
                </div>
              ))}

              {!guideForms.length && (
                <div className="text-sm text-[var(--muted)] border border-dashed border-[var(--border)] rounded-lg p-6 text-center">
                  Список пуст. Нажмите «Добавить» или «Стандартные».
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'registration' && isSuperAdmin && (
          <div className="card p-6 max-w-2xl space-y-5">
            <div>
              <h2 className="text-base font-semibold mb-1">Регистрация по SMS</h2>
              <p className="text-sm text-[var(--muted)]">
                Управляет вкладкой «По SMS» на странице регистрации. Изменения применяются сразу после сохранения.
              </p>
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="checkbox mt-0.5"
                checked={settings.smsRegistrationEnabled !== false}
                onChange={(e) => setSettings({
                  ...settings,
                  smsRegistrationEnabled: e.target.checked,
                })}
              />
              <span>
                <span className="text-sm font-medium block">Разрешить регистрацию по SMS</span>
                <span className="text-xs text-[var(--muted)]">
                  Если выключено, пользователи смогут регистрироваться только по email.
                </span>
              </span>
            </label>
            <div>
              <label className="label" htmlFor="smsDisabledMessage">
                Сообщение при отключённой SMS-регистрации
              </label>
              <textarea
                id="smsDisabledMessage"
                className="input min-h-[96px] resize-y"
                value={settings.smsRegistrationDisabledMessage || ''}
                onChange={(e) => setSettings({
                  ...settings,
                  smsRegistrationDisabledMessage: e.target.value,
                })}
                placeholder={MSTYLE_BRAND_DEFAULTS.smsRegistrationDisabledMessage}
                maxLength={500}
              />
              <p className="text-xs text-[var(--muted)] mt-1">
                Показывается во всплывающем уведомлении, когда пользователь нажимает «По SMS» или пытается зарегистрироваться по телефону.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="smsCodeText">
                Текст SMS с кодом подтверждения
              </label>
              <textarea
                id="smsCodeText"
                className="input min-h-[96px] resize-y font-mono text-sm"
                value={settings.smsRegistrationCodeText || ''}
                onChange={(e) => setSettings({
                  ...settings,
                  smsRegistrationCodeText: e.target.value,
                })}
                placeholder={MSTYLE_BRAND_DEFAULTS.smsRegistrationCodeText}
                maxLength={300}
              />
              <p className="text-xs text-[var(--muted)] mt-1">
                Используйте <code className="text-[var(--text)]">{'{code}'}</code> для подстановки 6-значного кода.
                Текст должен содержать этот шаблон. Рекомендуемая длина — до 70 символов (одно SMS).
              </p>
            </div>
          </div>
        )}

        <div className="mt-6 max-w-4xl flex flex-wrap gap-3">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Сохранение...' : labels.buttons.save}
          </button>
          {(tab === 'brand' || tab === 'colors') && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (!settings) return;
                if (tab === 'brand') {
                  setSettings({
                    ...settings,
                    siteName: MSTYLE_BRAND_DEFAULTS.siteName,
                    appVersion: MSTYLE_BRAND_DEFAULTS.appVersion,
                    siteIcon: MSTYLE_BRAND_DEFAULTS.siteIconLight,
                    siteIconLight: MSTYLE_BRAND_DEFAULTS.siteIconLight,
                    siteIconDark: MSTYLE_BRAND_DEFAULTS.siteIconDark,
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
                } else {
                  setSettings({
                    ...settings,
                    themePrimary: MSTYLE_BRAND_DEFAULTS.themePrimary,
                    themePrimaryHover: MSTYLE_BRAND_DEFAULTS.themePrimaryHover,
                  });
                  toast('Подставлены цвета M-STYLE. Нажмите «Сохранить» для применения.', 'info');
                }
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