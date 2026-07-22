/**
 * Дефолты инструкций (вкладка «Инструкции» в Help FAQ).
 * steps — нумерованный список; paragraphs — обычный текст.
 * Админка: /admin/site → «Инструкции».
 */
export interface GuideSection {
  id?: string;
  title: string;
  steps?: string[];
  paragraphs?: string[];
}

export type NormalizedGuideSection = {
  id: string;
  title: string;
  steps: string[];
  paragraphs: string[];
};

/** Дефолтные инструкции для панели помощи */
export const DEFAULT_GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'login',
    title: 'Вход и регистрация',
    steps: [
      'Войдите по логину, email или телефону (+7…) и паролю.',
      'Новый арендатор: вкладка «Регистрация» → ФИО, компания, пароль и повтор пароля.',
      'Подтвердите код из email или SMS (код действует 15 минут).',
      'После регистрации дождитесь активации администратором.',
    ],
    paragraphs: [
      'SMS отправляется не чаще 1 раза в 5 минут. Если SMS недоступно — используйте email.',
    ],
  },
  {
    id: 'password',
    title: 'Забыли пароль',
    steps: [
      'На странице входа нажмите «Забыли пароль?».',
      'Укажите email аккаунта — придёт код для нового пароля.',
      'Если email не найден или его нет в профиле — свяжитесь с администратором (контакты на странице входа).',
    ],
    paragraphs: [],
  },
  {
    id: 'order-pass',
    title: 'Заказ пропуска',
    steps: [
      'Раздел «Пропуска» → «Заказать пропуск».',
      'Выберите тип, укажите данные посетителя, дату, время и офис.',
      'При необходимости добавьте паспорт или гос. номер авто.',
      'Отправьте заявку. Статусы: на рассмотрении → одобрен → в здании → завершён.',
    ],
    paragraphs: [
      'Одобренный пропуск можно распечатать или отправить ссылку посетителю.',
    ],
  },
  {
    id: 'passes-list',
    title: 'Список пропусков',
    steps: [],
    paragraphs: [
      'Поиск по ФИО, телефону, офису и номеру. Фильтры по дате и статусу.',
      'Клик по строке открывает детали. Список обновляется автоматически.',
    ],
  },
  {
    id: 'reception',
    title: 'Ресепшн',
    steps: [
      'Журнал посетителей на выбранную дату.',
      'Поиск: номер пропуска, ФИО, телефон, паспорт, офис.',
      '«Ожидают входа» — пропустить или отклонить.',
      '«В здании» — зафиксировать выход.',
    ],
    paragraphs: [],
  },
  {
    id: 'profile',
    title: 'Профиль и сотрудники',
    steps: [],
    paragraphs: [
      'В профиле видны данные и статус подтверждения email.',
      'Владелец компании может добавлять сотрудников с отдельными правами.',
      'Изменение ФИО, телефона и компании у арендатора может требовать одобрения администратора.',
    ],
  },
];

const MAX_GUIDE_SECTIONS = 40;
const MAX_TITLE = 200;
const MAX_LINE = 500;
const MAX_LINES = 30;

function normalizeStringList(raw: unknown, maxLines = MAX_LINES, maxLen = MAX_LINE): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (out.length >= maxLines) break;
    const line = String(item ?? '').trim().slice(0, maxLen);
    if (line) out.push(line);
  }
  return out;
}

function toNormalized(section: GuideSection, index: number): NormalizedGuideSection {
  return {
    id: (section.id || '').trim().slice(0, 64) || `guide-${index + 1}`,
    title: (section.title || '').trim().slice(0, MAX_TITLE) || `Раздел ${index + 1}`,
    steps: normalizeStringList(section.steps),
    paragraphs: normalizeStringList(section.paragraphs),
  };
}

export function normalizeGuideSections(raw: unknown): NormalizedGuideSection[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_GUIDE_SECTIONS.map((s, i) => toNormalized(s, i));
  }

  const result: NormalizedGuideSection[] = [];
  for (let i = 0; i < Math.min(raw.length, MAX_GUIDE_SECTIONS); i += 1) {
    const row = raw[i];
    if (!row || typeof row !== 'object') continue;
    const title = String((row as GuideSection).title ?? '').trim().slice(0, MAX_TITLE);
    if (!title) continue;
    const steps = normalizeStringList((row as GuideSection).steps);
    const paragraphs = normalizeStringList((row as GuideSection).paragraphs);
    if (!steps.length && !paragraphs.length) continue;
    result.push({
      id: String((row as GuideSection).id ?? '').trim().slice(0, 64) || `guide-${i + 1}`,
      title,
      steps,
      paragraphs,
    });
  }

  return result.length
    ? result
    : DEFAULT_GUIDE_SECTIONS.map((s, i) => toNormalized(s, i));
}
