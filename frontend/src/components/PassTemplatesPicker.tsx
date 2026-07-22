'use client';

import { useEffect, useState } from 'react';
import { Bookmark, Car, Package, RefreshCw, Trash2, User, Wrench } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { api, getErrorMessage, PassTemplate, PassType, TYPE_LABELS } from '@/lib/api';

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

export function PassTemplatesPicker({ enabledTypes, selectedId, onSelect }: PassTemplatesPickerProps) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<PassTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    return api.getPassTemplates()
      .then(({ templates: data }) => setTemplates(data))
      .catch((err) => toast(getErrorMessage(err, 'Не удалось загрузить шаблоны'), 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { templates: data, imported } = await api.syncPassTemplates();
      setTemplates(data);
      toast(imported > 0 ? `Импортировано шаблонов: ${imported}` : 'Новых шаблонов из пропусков нет', 'success');
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
    <div className="card p-4 mb-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Bookmark className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold">Шаблоны</h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">Выберите шаблон, чтобы заполнить форму</p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary text-xs shrink-0"
          onClick={handleSync}
          disabled={syncing}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Импорт...' : 'Из пропусков'}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted)] animate-pulse">Загрузка шаблонов...</p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Шаблонов пока нет. Импортируйте из прошлых пропусков или заполните форму вручную.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
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
                  className="flex items-center gap-2 px-3 py-2 text-sm text-left min-w-0 disabled:opacity-50"
                  disabled={disabledType}
                  title={disabledType ? 'Тип пропуска отключён' : template.visitorName}
                  onClick={() => onSelect(template)}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0 text-[var(--status-approved)]" />
                  <span className="font-medium truncate max-w-[140px] sm:max-w-[200px]">{template.name}</span>
                  <span className="text-xs text-[var(--muted)] hidden sm:inline truncate max-w-[120px]">
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
      )}

      {templates.length > 0 && (
        <p className="text-xs text-[var(--muted)]">
          {TYPE_LABELS.visitor}, {TYPE_LABELS.parking} и другие типы подставляются из шаблона
        </p>
      )}
    </div>
  );
}