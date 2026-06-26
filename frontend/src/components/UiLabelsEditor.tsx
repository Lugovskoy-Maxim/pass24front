'use client';

import { UiLabels } from '@/lib/ui-labels';

type Section = {
  id: string;
  title: string;
  description?: string;
  fields: { path: string; label: string; placeholder?: string }[];
};

const SECTIONS: Section[] = [
  {
    id: 'nav',
    title: 'Меню навигации',
    description: 'Пункты в шапке сайта',
    fields: [
      { path: 'nav.dashboard', label: 'Главная' },
      { path: 'nav.templates', label: 'Шаблоны' },
      { path: 'nav.passes', label: 'Пропуска' },
      { path: 'nav.orderPass', label: 'Заказать' },
      { path: 'nav.reception', label: 'Ресепшн' },
      { path: 'nav.admin', label: 'Админ' },
      { path: 'nav.logout', label: 'Выйти' },
    ],
  },
  {
    id: 'pages',
    title: 'Заголовки страниц',
    fields: [
      { path: 'pages.passesTitle', label: 'Список пропусков' },
      { path: 'pages.passesSubtitleAll', label: 'Подзаголовок (все пропуска)' },
      { path: 'pages.passesSubtitleOwn', label: 'Подзаголовок (свои)' },
      { path: 'pages.receptionTitle', label: 'Ресепшн — заголовок' },
      { path: 'pages.receptionSubtitle', label: 'Ресепшн — подзаголовок' },
      { path: 'pages.dashboardRecentAll', label: 'Главная — все пропуска' },
      { path: 'pages.dashboardRecentOwn', label: 'Главная — свои' },
      { path: 'pages.orderPassTitle', label: 'Заказ пропуска' },
      { path: 'pages.dashboardWelcome', label: 'Главная — приветствие' },
      { path: 'pages.dashboardManagePasses', label: 'Главная — подзаголовок' },
    ],
  },
  {
    id: 'passes',
    title: 'Страница пропусков',
    fields: [
      { path: 'passes.detailTitle', label: 'Заголовок панели деталей' },
      { path: 'passes.searchPlaceholder', label: 'Поиск' },
      { path: 'passes.allStatuses', label: 'Фильтр: все статусы' },
      { path: 'passes.notFound', label: 'Ничего не найдено' },
      { path: 'passes.loading', label: 'Загрузка' },
      { path: 'passes.close', label: 'Закрыть (aria)' },
    ],
  },
  {
    id: 'dashboard',
    title: 'Главная страница',
    fields: [
      { path: 'dashboard.statPending', label: 'Счётчик: на рассмотрении' },
      { path: 'dashboard.statActive', label: 'Счётчик: в здании' },
      { path: 'dashboard.statToday', label: 'Счётчик: сегодня' },
      { path: 'dashboard.quickOrderTitle', label: 'Быстрый заказ' },
      { path: 'dashboard.quickOrderEmpty', label: 'Нет шаблонов' },
      { path: 'dashboard.emptyPasses', label: 'Нет пропусков' },
      { path: 'dashboard.goToTemplates', label: 'Перейти к шаблонам' },
    ],
  },
  {
    id: 'buttons',
    title: 'Кнопки действий',
    description: 'Тексты на кнопках во всём приложении',
    fields: [
      { path: 'buttons.approve', label: 'Одобрить' },
      { path: 'buttons.reject', label: 'Отклонить' },
      { path: 'buttons.checkIn', label: 'Впустить' },
      { path: 'buttons.checkOut', label: 'Выход' },
      { path: 'buttons.cancel', label: 'Отменить' },
      { path: 'buttons.cancelRequest', label: 'Отменить заявку' },
      { path: 'buttons.order', label: 'Заказать пропуск' },
      { path: 'buttons.copyLink', label: 'Копировать ссылку' },
      { path: 'buttons.linkCopied', label: 'Ссылка скопирована' },
      { path: 'buttons.lookup', label: 'Найти' },
      { path: 'buttons.allPasses', label: 'Все пропуска' },
      { path: 'buttons.auditLog', label: 'Журнал действий' },
      { path: 'buttons.qrPass', label: 'QR-пропуск (подсказка)' },
      { path: 'buttons.copyNumber', label: 'Копировать номер' },
      { path: 'buttons.retry', label: 'Повторить' },
      { path: 'buttons.backToPasses', label: 'К списку пропусков' },
      { path: 'buttons.backToTemplates', label: 'К шаблонам' },
      { path: 'buttons.save', label: 'Сохранить' },
      { path: 'buttons.share', label: 'Поделиться' },
      { path: 'buttons.print', label: 'Печать' },
      { path: 'buttons.orderShort', label: 'Заказать (кратко)' },
      { path: 'buttons.checkInBuilding', label: 'Впустить в здание' },
      { path: 'buttons.fullAudit', label: 'Весь журнал' },
      { path: 'buttons.export', label: 'Скачать CSV' },
      { path: 'buttons.apply', label: 'Применить' },
      { path: 'buttons.reset', label: 'Сбросить' },
    ],
  },
  {
    id: 'statuses',
    title: 'Статусы пропусков',
    fields: [
      { path: 'statuses.pending', label: 'На рассмотрении' },
      { path: 'statuses.approved', label: 'Одобрен' },
      { path: 'statuses.rejected', label: 'Отклонён' },
      { path: 'statuses.active', label: 'В здании' },
      { path: 'statuses.completed', label: 'Покинул БЦ' },
      { path: 'statuses.expired', label: 'Истёк' },
      { path: 'statuses.cancelled', label: 'Отменён' },
    ],
  },
  {
    id: 'reception',
    title: 'Ресепшн',
    fields: [
      { path: 'reception.statTotal', label: 'Счётчик: всего' },
      { path: 'reception.statPending', label: 'Счётчик: новые' },
      { path: 'reception.statApproved', label: 'Счётчик: ожидают' },
      { path: 'reception.statActive', label: 'Счётчик: в здании' },
      { path: 'reception.statCompleted', label: 'Счётчик: выехали' },
      { path: 'reception.sectionPending', label: 'Раздел: на рассмотрении' },
      { path: 'reception.sectionApproved', label: 'Раздел: ожидают въезда' },
      { path: 'reception.sectionActive', label: 'Раздел: в здании' },
      { path: 'reception.sectionCompleted', label: 'Раздел: завершённые' },
      { path: 'reception.sectionExpired', label: 'Раздел: истёкшие' },
      { path: 'reception.rejectPlaceholder', label: 'Поле причины отклонения' },
      { path: 'reception.lookupPlaceholder', label: 'Поиск пропуска' },
      { path: 'reception.emptySection', label: 'Пустой раздел' },
      { path: 'reception.overdueInsideBanner', label: 'Баннер: гость в БЦ' },
      { path: 'reception.overdueInsideBadge', label: 'Бейдж просрочки' },
      { path: 'reception.overdueInsideCard', label: 'Текст на карточке' },
    ],
  },
  {
    id: 'timeline',
    title: 'Этапы на карточке',
    description: 'Цепочка статусов на пропуске',
    fields: [
      { path: 'timeline.request', label: 'Заявка' },
      { path: 'timeline.approve', label: 'Одобрение' },
      { path: 'timeline.entry', label: 'Вход' },
      { path: 'timeline.inside', label: 'В здании' },
      { path: 'timeline.exit', label: 'Выход' },
      { path: 'timeline.waiting', label: 'Ожидает' },
      { path: 'timeline.rejected', label: 'Отклонён (этап)' },
      { path: 'timeline.cancelled', label: 'Отменён (этап)' },
      { path: 'timeline.expired', label: 'Истёк (этап)' },
    ],
  },
  {
    id: 'card',
    title: 'Поля карточки',
    fields: [
      { path: 'card.office', label: 'Офис' },
      { path: 'card.visitor', label: 'Посетитель' },
      { path: 'card.company', label: 'Компания' },
      { path: 'card.visitDate', label: 'Дата визита' },
      { path: 'card.orderedBy', label: 'Заказал' },
      { path: 'card.passNumber', label: 'Номер пропуска' },
      { path: 'card.electronicPass', label: 'Электронный пропуск' },
      { path: 'card.floorSuffix', label: 'Суффикс этажа' },
      { path: 'card.officePrefix', label: 'Префикс офиса' },
      { path: 'card.visitPurpose', label: 'Цель визита' },
      { path: 'card.visitPurposeShort', label: 'Цель (кратко)' },
      { path: 'card.phone', label: 'Телефон' },
      { path: 'card.vehicle', label: 'Авто' },
      { path: 'card.type', label: 'Тип' },
      { path: 'card.businessCenter', label: 'Бизнес-центр' },
      { path: 'card.comment', label: 'Комментарий' },
      { path: 'card.rejectionReason', label: 'Причина отклонения' },
      { path: 'card.checkIn', label: 'Вход (время)' },
      { path: 'card.checkOut', label: 'Выход (время)' },
    ],
  },
  {
    id: 'print',
    title: 'Печать пропуска',
    fields: [
      { path: 'print.guestPass', label: 'Заголовок гостевого' },
      { path: 'print.printButton', label: 'Кнопка печати' },
      { path: 'print.dateShort', label: 'Дата (кратко)' },
    ],
  },
  {
    id: 'ticket',
    title: 'Страница билета (QR)',
    fields: [
      { path: 'ticket.hint', label: 'Подсказка посетителю' },
      { path: 'ticket.footer', label: 'Текст внизу страницы' },
      { path: 'ticket.defaultBcName', label: 'БЦ по умолчанию' },
    ],
  },
  {
    id: 'ticketPage',
    title: 'Страница билета',
    fields: [
      { path: 'ticketPage.loading', label: 'Загрузка' },
      { path: 'ticketPage.notFound', label: 'Не найден' },
      { path: 'ticketPage.home', label: 'На главную' },
    ],
  },
  {
    id: 'toasts',
    title: 'Уведомления',
    fields: [
      { path: 'toasts.approved', label: 'Одобрен' },
      { path: 'toasts.rejected', label: 'Отклонён' },
      { path: 'toasts.checkedIn', label: 'Впущен' },
      { path: 'toasts.checkedOut', label: 'Выход' },
      { path: 'toasts.actionDone', label: 'Действие выполнено' },
      { path: 'toasts.passFound', label: 'Найден пропуск' },
      { path: 'toasts.guestStillInside', label: 'Гость всё ещё в БЦ' },
    ],
  },
];

function getNested(obj: UiLabels, path: string): string {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object') return '';
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' ? cur : '';
}

function setNested(obj: UiLabels, path: string, value: string): UiLabels {
  const parts = path.split('.');
  const clone = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
  let cur: Record<string, unknown> = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
  return clone as UiLabels;
}

interface UiLabelsEditorProps {
  labels: UiLabels;
  onChange: (labels: UiLabels) => void;
}

export function UiLabelsEditor({ labels, onChange }: UiLabelsEditorProps) {
  return (
    <div className="space-y-4">
      {SECTIONS.map((section) => (
        <details key={section.id} className="card overflow-hidden group" open={section.id === 'buttons'}>
          <summary className="px-4 py-3 cursor-pointer font-semibold text-sm bg-slate-50/80 border-b border-[var(--border)] hover:bg-slate-100/80 transition-colors list-none flex items-center justify-between">
            <span>{section.title}</span>
            <span className="text-xs text-[var(--muted)] font-normal">{section.fields.length} полей</span>
          </summary>
          <div className="p-4 space-y-3">
            {section.description && (
              <p className="text-xs text-[var(--muted)] -mt-1 mb-2">{section.description}</p>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              {section.fields.map((field) => (
                <div key={field.path}>
                  <label className="label text-xs">{field.label}</label>
                  <input
                    className="input text-sm"
                    value={getNested(labels, field.path)}
                    placeholder={field.placeholder}
                    onChange={(e) => onChange(setNested(labels, field.path, e.target.value))}
                  />
                </div>
              ))}
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}