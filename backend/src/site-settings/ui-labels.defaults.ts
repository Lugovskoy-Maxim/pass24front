export const DEFAULT_UI_LABELS = {
  nav: {
    dashboard: 'Главная',
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
    copyLink: 'Скопировать ссылку на пропуск',
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
    statTotal: 'Всего',
    statPending: 'Новые',
    statApproved: 'Ожидают',
    statActive: 'В здании',
    statCompleted: 'Выехали',
    sectionPending: 'На рассмотрении',
    sectionApproved: 'Ожидают въезда',
    sectionActive: 'В здании',
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

export type UiLabels = typeof DEFAULT_UI_LABELS;

export function deepMergeUiLabels(partial?: Record<string, unknown> | null): UiLabels {
  if (!partial || typeof partial !== 'object') {
    return JSON.parse(JSON.stringify(DEFAULT_UI_LABELS));
  }

  const merge = (base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object') {
        out[key] = merge(base[key] as Record<string, unknown>, value as Record<string, unknown>);
      } else if (typeof value === 'string' && value.trim()) {
        out[key] = value.trim();
      }
    }
    return out;
  };

  return merge(
    JSON.parse(JSON.stringify(DEFAULT_UI_LABELS)),
    partial,
  ) as UiLabels;
}