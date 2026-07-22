/**
 * Дефолты FAQ/инструкций на фронте (fallback, если /config ещё пуст).
 * Актуальный контент после админки: config.faqItems / config.helpGuideSections
 * (resolveFaqItems / resolveGuideSections).
 * Backend-дефолты: site-settings/faq-defaults.ts, guide-defaults.ts — держите синхронно при смене текстов.
 */
import type { FaqItem, HelpGuideSection as ApiHelpGuideSection } from './api';

export type HelpGuideSection = {
  id: string;
  title: string;
  steps?: string[];
  paragraphs?: string[];
};

export type HelpFaqItem = FaqItem;

export const HELP_GUIDE_SECTIONS: HelpGuideSection[] = [
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
  },
  {
    id: 'profile',
    title: 'Профиль и сотрудники',
    paragraphs: [
      'В профиле видны данные и статус подтверждения email.',
      'Владелец компании может добавлять сотрудников с отдельными правами.',
      'Изменение ФИО, телефона и компании у арендатора может требовать одобрения администратора.',
    ],
  },
];

/** Дефолтные частые вопросы (если в настройках ещё нет своих) */
export const HELP_FAQ_ITEMS: HelpFaqItem[] = [
  {
    id: 'no-email-code',
    question: 'Не пришёл код на email',
    answer:
      'Проверьте папку «Спам» и корректность адреса. Запросите код повторно. Если письма нет — обратитесь к администратору: возможно, SMTP временно недоступен.',
  },
  {
    id: 'no-sms',
    question: 'Не пришло SMS',
    answer:
      'Номер должен быть в формате +7 (9XX) XXX-XX-XX. Повторная отправка — не чаще раза в 5 минут. Если SMS отключено администратором, регистрируйтесь по email.',
  },
  {
    id: 'cant-login-after-reg',
    question: 'Не могу войти после регистрации',
    answer:
      'После подтверждения кода заявка ждёт активации администратором. В шапке будет уведомление об ожидании. Пока аккаунт не активен, вход ограничен.',
  },
  {
    id: 'forgot-password',
    question: 'Как восстановить пароль?',
    answer:
      'На форме входа: «Забыли пароль?» → email → код из письма → новый пароль. Без email в аккаунте восстановление только через администратора.',
  },
  {
    id: 'email-not-verified',
    question: 'Что значит «почта не подтверждена»?',
    answer:
      'Email подтверждён, если вы регистрировались по почте и ввели код. При регистрации только по SMS email (если указан) считается неподтверждённым, пока не будет подтверждён иначе.',
  },
  {
    id: 'no-section',
    question: 'Не вижу нужный раздел',
    answer:
      'Меню зависит от роли и прав. Арендатор заказывает пропуска, ресепшн ведёт журнал, админ — настройки. Если доступа нет — запросите его у администратора БЦ.',
  },
  {
    id: 'visitor-qr',
    question: 'Как посетителю показать пропуск?',
    answer:
      'Отправьте ссылку на электронный пропуск (кнопка «Поделиться»). На странице — QR-код и данные визита. На ресепшене можно найти пропуск по номеру или ФИО.',
  },
  {
    id: 'templates',
    question: 'Зачем шаблоны пропусков?',
    answer:
      'Шаблоны сохраняют частых посетителей (ФИО, тип, офис), чтобы быстрее оформлять повторные заявки без повторного ввода данных.',
  },
];

/** Публичный список FAQ: из настроек сайта или дефолт */
export function resolveFaqItems(items?: FaqItem[] | null): HelpFaqItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    return HELP_FAQ_ITEMS;
  }
  const normalized = items
    .map((item, index) => ({
      id: (item.id || `faq-${index + 1}`).trim(),
      question: (item.question || '').trim(),
      answer: (item.answer || '').trim(),
    }))
    .filter((item) => item.question && item.answer);
  return normalized.length ? normalized : HELP_FAQ_ITEMS;
}

function cleanLines(lines?: string[] | null): string[] {
  if (!Array.isArray(lines)) return [];
  return lines.map((line) => String(line || '').trim()).filter(Boolean);
}

/** Публичные инструкции: из настроек сайта или дефолт */
export function resolveGuideSections(
  items?: ApiHelpGuideSection[] | HelpGuideSection[] | null,
): HelpGuideSection[] {
  if (!Array.isArray(items) || items.length === 0) {
    return HELP_GUIDE_SECTIONS;
  }
  const normalized = items
    .map((item, index) => {
      const title = (item.title || '').trim();
      const steps = cleanLines(item.steps);
      const paragraphs = cleanLines(item.paragraphs);
      return {
        id: (item.id || `guide-${index + 1}`).trim(),
        title,
        steps,
        paragraphs,
      };
    })
    .filter((item) => item.title && (item.steps.length > 0 || item.paragraphs.length > 0));
  return normalized.length ? normalized : HELP_GUIDE_SECTIONS;
}

/** Для админ-формы: шаги/абзацы как многострочный текст */
export function linesToText(lines?: string[] | null): string {
  return cleanLines(lines).join('\n');
}

export function textToLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
