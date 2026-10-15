'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Bookmark,
  Car,
  Package,
  RefreshCw,
  Trash2,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import { api, getErrorMessage, PassTemplate, PassType } from '@/lib/api';

const TYPE_ICONS: Record<PassType, typeof User> = {
  visitor: User,
  parking: Car,
  delivery: Package,
  contractor: Wrench,
};

interface PassTemplatesPickerProps {
  enabledTypes: PassType[];
  selectedId?: string | null;
  onSelect: (template: PassTemplate) => void;
}

export function PassTemplatesPicker({
  enabledTypes,
  selectedId,
  onSelect,
}: PassTemplatesPickerProps) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<PassTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return api
      .getPassTemplates()
      .then(({ templates: data }) => setTemplates(data))
      .catch((err) =>
        toast(getErrorMessage(err, 'Не удалось загрузить шаблоны'), 'error'),
      )
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { templates: data, imported } = await api.syncPassTemplates();
      setTemplates(data);
      toast(
        imported > 0
          ? `Импортировано шаблонов: ${imported}`
          : 'Новых шаблонов из пропусков нет',
        'success',
      );
    } catch (err) {
      toast(getErrorMessage(err, 'Не удалось выполнить действие'), 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить шаблон?')) return;
    setDeletingId(id);
    try {
      await api.deletePassTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast('Шаблон удалён', 'success');
    } catch (err) {
      toast(getErrorMessage(err, 'Не удалось выполнить действие'), 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="relative flex justify-end mb-2">
      <button
        type="button"
        className="relative inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] transition-colors"
        onClick={() => setExpanded((value) => !value)}
        aria-label="Шаблоны пропусков"
        aria-expanded={expanded}
        title="Шаблоны"
      >
        <Bookmark className="w-4 h-4" />
        <span>Шаблоны</span>
        {!loading && templates.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 h-4 px-1 rounded-full bg-[var(--accent)] text-white text-[9px] leading-4 text-center">
            {templates.length}
          </span>
        )}
      </button>

      {expanded && (
        <div className="absolute right-0 top-full z-20 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Bookmark className="w-4 h-4 text-[var(--muted)]" />
              Шаблоны
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] transition-colors"
                onClick={handleSync}
                disabled={syncing}
                title="Создать шаблоны из прошлых пропусков"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`}
                />
                {syncing ? 'Импорт…' : 'Из пропусков'}
              </button>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
                onClick={() => setExpanded(false)}
                aria-label="Закрыть шаблоны"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {loading ? (
            <p className="py-2 text-xs text-[var(--muted)] animate-pulse">
              Загрузка…
            </p>
          ) : templates.length > 0 ? (
            <div className="flex flex-col gap-1 max-h-[55vh] overflow-y-auto">
              {templates.map((template) => {
                const Icon = TYPE_ICONS[template.passType];
                const active = selectedId === template.id;
                const disabledType = !enabledTypes.includes(template.passType);
                return (
                  <div
                    key={template.id}
                    className={`flex items-center gap-1 rounded-lg border transition-colors ${
                      active
                        ? 'border-[var(--status-approved-border)] bg-[var(--status-approved-soft)]'
                        : 'border-[var(--border)] bg-[var(--surface)]'
                    }`}
                  >
                    <button
                      type="button"
                      className="flex flex-1 min-w-0 items-center gap-2 px-3 py-2 text-sm text-left disabled:opacity-50"
                      disabled={disabledType}
                      title={
                        disabledType
                          ? 'Тип пропуска отключён'
                          : template.visitorName
                      }
                      onClick={() => {
                        onSelect(template);
                        setExpanded(false);
                      }}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0 text-[var(--status-approved)]" />
                      <span className="font-medium truncate">
                        {template.name}
                      </span>
                      <span className="text-xs text-[var(--muted)] truncate">
                        {template.visitorName}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="p-2 text-[var(--muted)] hover:text-[var(--danger)] shrink-0"
                      disabled={deletingId === template.id}
                      onClick={() => handleDelete(template.id)}
                      aria-label="Удалить шаблон"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-2 text-xs text-[var(--muted)]">
              Сохранённых шаблонов пока нет
            </p>
          )}
        </div>
      )}
    </div>
  );
}
