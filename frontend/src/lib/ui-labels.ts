import { BcConfig, PassStatus, SiteSettings } from './api';

export const DEFAULT_UI_LABELS = {
  nav: {
    dashboard: 'Главная',
    profile: 'Профиль',
    templates: 'Шаблоны',
    passes: 'Пропуска',
    orderPass: 'Заказать',
    reception: 'Ресепшн',
    admin: 'Админ',
    logout: 'Выйти',
  },
  pages: {
    passesTitle: 'Пропуска',
    passesSubtitleAll: 'Все заявки пользователей системы',
    passesSubtitleOwn: 'Ваши заказанные пропуска',
    receptionTitle: 'Панель ресепшн',
    receptionSubtitle: 'Журнал посетителей на выбранную дату',
    dashboardRecentAll: 'Последние пропуска всех пользователей',
    dashboardRecentOwn: 'Последние пропуска',
    templatesTitle: 'Шаблоны пропусков',
    orderPassTitle: 'Заказ пропуска',
    dashboardWelcome: 'Добро пожаловать',
    dashboardManagePasses: 'Управление пропусками',
  },
  passes: {
    detailTitle: 'Детали пропуска',
    detailTimeline: 'Ход визита',
    searchPlaceholder: 'Поиск...',
    allStatuses: 'Все статусы',
    notFound: 'Пропуска не найдены',
    loading: 'Загрузка...',
    close: 'Закрыть',
    countOne: 'пропуск',
    countFew: 'пропуска',
    countMany: 'пропусков',
  },
  dashboard: {
    statPending: 'На рассмотрении',
    statActive: 'Сейчас в здании',
    statToday: 'Сегодня',
    quickOrderTitle: 'Быстрый заказ',
    quickOrderEmpty: 'Создайте шаблон посетителя или импортируйте из прошлых пропусков.',
    emptyPasses: 'Пропусков пока нет. Закажите пропуск для посетителя или курьера.',
    goToTemplates: 'Перейти к шаблонам',
  },
  print: {
    guestPass: 'Гостевой пропуск',
    printButton: 'Печать пропуска',
    dateShort: 'Дата',
  },
  ticketPage: {
    loading: 'Загрузка пропуска...',
    notFound: 'Пропуск не найден',
    home: 'На главную',
  },
  buttons: {
    approve: 'Одобрить',
    reject: 'Отклонить',
    checkIn: 'Пропустить на вход',
    checkOut: 'Зафиксировать выход',
    cancel: 'Отменить',
    cancelRequest: 'Отменить заявку',
    order: 'Заказать пропуск',
    save: 'Сохранить',
    share: 'Поделиться',
    copyLink: 'Скопировать ссылку',
    shareSocial: 'В приложения и соцсети',
    sendToEmail: 'Отправить на почту',
    sendEmailTitle: 'Отправить пропуск на почту',
    sendEmailHint: 'На указанный адрес придёт письмо со ссылкой на пропуск и QR-кодом',
    sendEmailSubmit: 'Отправить',
    sendEmailSending: 'Отправка…',
    sendEmailSuccess: 'Письмо отправлено',
    sendEmailSuccessHint: 'Если письма нет во «Входящих», проверьте папку «Спам».',
    sendEmailError: 'Не удалось отправить письмо',
    sendEmailClose: 'Закрыть',
    sendEmailRetry: 'Повторить',
    linkCopied: 'Ссылка скопирована',
    lookup: 'Найти',
    allPasses: 'Все пропуска',
    auditLog: 'Журнал действий',
    fullAudit: 'Весь журнал',
    retry: 'Повторить',
    apply: 'Применить',
    reset: 'Сбросить',
    export: 'Скачать CSV',
    backToPasses: 'К списку пропусков',
    backToTemplates: 'К шаблонам',
    print: 'Печать',
    qrPass: 'QR-пропуск',
    copyNumber: 'Скопировать номер',
    orderShort: 'Заказать',
    checkInBuilding: 'Впустить в здание',
  },
  statuses: {
    pending: 'На рассмотрении',
    approved: 'Одобрен',
    rejected: 'Отклонён',
    active: 'В здании',
    completed: 'Покинул БЦ',
    expired: 'Истёк',
    cancelled: 'Отменён',
  },
  reception: {
    showStats: 'Статистика',
    hideStats: 'Скрыть статистику',
    statTotal: 'Всего',
    statPending: 'Новые',
    statApproved: 'Ожидают',
    statActive: 'В здании',
    statCompleted: 'Выехали',
    statOverdue: 'Не вышли в срок',
    sectionPending: 'На рассмотрении',
    sectionApproved: 'Ожидают въезда',
    sectionActive: 'В здании',
    sectionOverdue: 'Не вышли в срок — оформите выход',
    sectionCompleted: 'Завершённые',
    sectionExpired: 'Истёкшие',
    sectionRejected: 'Отклонённые',
    sectionCancelled: 'Отменённые',
    rejectPlaceholder: 'Причина отклонения',
    lookupPlaceholder: 'Номер пропуска, ФИО, авто...',
    emptySection: 'Нет пропусков в этом разделе',
    overdueInsideBanner: 'Посетители всё ещё в здании после даты визита — оформите выход вручную',
    overdueInsideBadge: 'Просрочен визит',
    overdueInsideCard: 'Гость в здании после даты визита — пропуск сохранён, оформите выход',
    overdueEndTimeBanner: 'Гости не вышли до назначенного времени — оформите выход вручную',
    overdueEndTimeBadge: 'Просрочен выход',
    overdueEndTimeCard: 'Гость в здании после {time} — пропуск сохранён, оформите выход',
    overdueMixedBanner: 'Гости не вышли в срок (время или дата визита) — оформите выход вручную',
    lookupResult: 'Результат поиска',
    journalLoading: 'Загрузка журнала...',
    journalEmpty: 'На выбранную дату пропусков нет',
    selectedPass: 'Выбранный пропуск',
  },
  timeline: {
    request: 'Заявка',
    approve: 'Одобрение',
    entry: 'Вход',
    inside: 'В здании',
    exit: 'Выход',
    waiting: 'Ожидает',
    rejected: 'Отклонён',
    cancelled: 'Отменён',
    expired: 'Истёк',
  },
  card: {
    office: 'Офис',
    visitor: 'Посетитель',
    company: 'Компания',
    visitDate: 'Дата визита',
    visitPurpose: 'Цель визита',
    visitPurposeShort: 'Цель',
    orderedBy: 'Заказал',
    passNumber: 'Номер',
    phone: 'Телефон',
    vehicle: 'Авто',
    type: 'Тип',
    businessCenter: 'Бизнес-центр',
    comment: 'Комментарий',
    rejectionReason: 'Причина отклонения',
    checkIn: 'Вход',
    checkOut: 'Выход',
    electronicPass: 'Электронный пропуск',
    floorSuffix: 'эт.',
    officePrefix: 'оф.',
  },
  ticket: {
    hint: 'Подойдите на стойку охраны и скажите своё ФИО или покажите QR-код',
    footer: 'Сохраните эту страницу — ссылка постоянная и действует на дату визита',
    defaultBcName: 'Бизнес-центр',
  },
  toasts: {
    approved: 'Пропуск одобрен',
    rejected: 'Пропуск отклонён',
    checkedIn: 'Посетитель пропущен',
    checkedOut: 'Выход зафиксирован',
    actionDone: 'Действие выполнено',
    passFound: 'Найден пропуск',
    guestStillInside: 'Посетитель всё ещё в здании. Пропуск не аннулирован — оформите выход.',
    guestPastEndTime: 'Посетитель не вышел до {time}. Оформите выход вручную.',
  },
} as const;

export {
  getGuestOverdueKind,
  getLocalDateString,
  getOverdueBadgeLabel,
  getOverdueBannerText,
  getOverdueCardMessage,
  isGuestStillInside,
} from './pass-overdue';
export type { GuestOverdueKind } from './pass-overdue';

export type UiLabels = typeof DEFAULT_UI_LABELS;

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object') {
      out[key] = deepMerge(base[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else if (typeof value === 'string' && value.trim()) {
      out[key] = value.trim();
    }
  }
  return out;
}

export function mergeUiLabels(partial?: Record<string, unknown> | null): UiLabels {
  if (!partial) return JSON.parse(JSON.stringify(DEFAULT_UI_LABELS));
  return deepMerge(
    JSON.parse(JSON.stringify(DEFAULT_UI_LABELS)),
    partial,
  ) as UiLabels;
}

export function getUiLabels(config?: BcConfig | SiteSettings | null): UiLabels {
  return mergeUiLabels(config?.uiLabels as Record<string, unknown> | undefined);
}

export function getStatusLabel(status: PassStatus, labels: UiLabels): string {
  return labels.statuses[status] || DEFAULT_UI_LABELS.statuses[status];
}

/** @deprecated Use pass-card utilities from lib/pass-status.ts */
export function getPassCardBorderClass(_status: PassStatus, _stillInside?: boolean): string {
  return '';
}

export type PassCardData = {
  passNumber: string;
  visitorName: string;
  passType: string;
  status: PassStatus;
  visitDate: string;
  visitTimeFrom?: string;
  visitTimeTo?: string;
  office: string;
  floor?: string;
  businessCenterName?: string;
  companyName?: string;
  visitorPhone?: string;
  vehiclePlate?: string;
  visitPurpose?: string;
  comment?: string;
  creatorName?: string;
  creatorCompany?: string;
  creatorPhone?: string;
  createdAt?: string;
  approvedAt?: string;
  checkedInAt?: string;
  checkedOutAt?: string;
  rejectionReason?: string;
  requireCheckout?: boolean;
};