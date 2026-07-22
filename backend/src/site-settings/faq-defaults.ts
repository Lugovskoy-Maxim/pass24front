/**
 * Дефолты и нормализация FAQ для панели «Помощь».
 * Админка может переопределить; пустой/битый список → DEFAULT_FAQ_ITEMS.
 */
export interface FaqItem {
  /** Во входных DTO может отсутствовать — normalize всегда проставляет id */
  id?: string;
  question: string;
  answer: string;
}

export type NormalizedFaqItem = Required<Pick<FaqItem, 'id' | 'question' | 'answer'>>;

export const DEFAULT_FAQ_ITEMS: FaqItem[] = [
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

const MAX_FAQ_ITEMS = 50;
const MAX_QUESTION = 300;
const MAX_ANSWER = 2000;

export function normalizeFaqItems(raw: unknown): NormalizedFaqItem[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_FAQ_ITEMS.map((item) => ({
      id: item.id || 'faq',
      question: item.question,
      answer: item.answer,
    }));
  }

  const result: NormalizedFaqItem[] = [];
  for (let i = 0; i < Math.min(raw.length, MAX_FAQ_ITEMS); i += 1) {
    const row = raw[i];
    if (!row || typeof row !== 'object') continue;
    const question = String((row as FaqItem).question ?? '').trim().slice(0, MAX_QUESTION);
    const answer = String((row as FaqItem).answer ?? '').trim().slice(0, MAX_ANSWER);
    if (!question || !answer) continue;
    const idRaw = String((row as FaqItem).id ?? '').trim().slice(0, 64);
    const id = idRaw || `faq-${i + 1}`;
    result.push({ id, question, answer });
  }

  return result.length
    ? result
    : DEFAULT_FAQ_ITEMS.map((item) => ({
        id: item.id || 'faq',
        question: item.question,
        answer: item.answer,
      }));
}
