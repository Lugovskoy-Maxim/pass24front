/**
 * Единый разбор ошибок API/сети для пользователя.
 * Скрывает технические формулировки (Internal Server Error, HTML 502 и т.п.),
 * переводит типовые ответы NestJS / class-validator на русский.
 */

export class ApiError extends Error {
  status?: number;
  isNetworkError: boolean;

  constructor(message: string, options?: { status?: number; isNetworkError?: boolean }) {
    super(message);
    this.name = 'ApiError';
    this.status = options?.status;
    this.isNetworkError = !!options?.isNetworkError;
  }
}

const NETWORK_ERROR_MARKERS = [
  'failed to fetch',
  'networkerror',
  'network request failed',
  'load failed',
  'fetch failed',
  'econnrefused',
  'err_connection_refused',
  'err_connection_reset',
  'err_internet_disconnected',
  'the internet connection appears to be offline',
  'network error',
  'abort',
];

/** Английские / технические ответы → понятный русский */
const MESSAGE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/^internal server error\.?$/i, 'На сервере произошла ошибка. Попробуйте позже или обратитесь к администратору.'],
  [/^bad request\.?$/i, 'Проверьте введённые данные и попробуйте снова.'],
  [/^unauthorized\.?$/i, 'Нужно войти в систему.'],
  [/^forbidden\.?$/i, 'Недостаточно прав для этого действия.'],
  [/^not found\.?$/i, 'Запрошенные данные не найдены.'],
  [/^conflict\.?$/i, 'Данные уже используются. Измените значения и попробуйте снова.'],
  [/^too many requests\.?$/i, 'Слишком много запросов. Подождите немного и попробуйте снова.'],
  [/^service unavailable\.?$/i, 'Сервис временно недоступен. Попробуйте позже.'],
  [/^gateway timeout\.?$/i, 'Сервер не ответил вовремя. Попробуйте позже.'],
  [/^bad gateway\.?$/i, 'Сервер временно недоступен. Попробуйте позже.'],
  [/^request failed with status code \d+$/i, 'Не удалось выполнить запрос. Попробуйте снова.'],
  [/^jwt (expired|malformed|invalid).*$/i, 'Сессия истекла. Войдите снова.'],
  [/^invalid credentials\.?$/i, 'Неверный логин или пароль.'],
  [/^throttlerException.*$/i, 'Слишком много запросов. Подождите немного.'],
  // class-validator (en)
  [/\bmust be an email\b/i, 'Некорректный email'],
  [/\bmust be a valid (email|phone)\b/i, 'Некорректное значение'],
  [/\bshould not be empty\b/i, 'Заполните обязательное поле'],
  [/\bmust be longer than or equal to (\d+) characters?\b/i, 'Минимум $1 символов'],
  [/\bmust be shorter than or equal to (\d+) characters?\b/i, 'Не более $1 символов'],
  [/\bmust be a (string|number|boolean|array|object)\b/i, 'Некорректный формат данных'],
  [/\bmust match .* regular expression\b/i, 'Значение в неверном формате'],
  [/\beach value in .* must be\b/i, 'Некорректное значение в списке'],
  [/\bproperty \w+ should not exist\b/i, 'Передано лишнее поле. Обновите страницу и попробуйте снова.'],
  [/\bwhitelist validation failed\b/i, 'Переданы недопустимые данные. Обновите страницу и попробуйте снова.'],
  // HTML / nginx
  [/<html[\s\S]*>/i, 'Сервер временно недоступен. Попробуйте позже.'],
  [/^<!doctype html/i, 'Сервер временно недоступен. Попробуйте позже.'],
  [/\b502 Bad Gateway\b/i, 'Сервер временно недоступен. Попробуйте позже.'],
  [/\b503 Service Unavailable\b/i, 'Сервис временно недоступен. Попробуйте позже.'],
  [/\b504 Gateway Timeout\b/i, 'Сервер не ответил вовремя. Попробуйте позже.'],
  [/\bECONNREFUSED\b/i, 'Нет связи с сервером. Проверьте интернет и попробуйте снова.'],
  [/\bMongo(Server)?Error\b/i, 'Ошибка сохранения данных. Попробуйте снова или обратитесь к администратору.'],
  [/\bE11000\b/i, 'Такая запись уже существует.'],
];

function isNetworkMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return NETWORK_ERROR_MARKERS.some((marker) => lower.includes(marker));
}

function humanizePart(raw: string): string {
  let text = raw.trim();
  if (!text) return '';

  // Убрать префиксы вида "email must be..." → уже обработается regex
  for (const [pattern, replacement] of MESSAGE_REPLACEMENTS) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement);
    }
  }

  // Если остался чисто английский короткий системный текст
  if (/^[A-Za-z][A-Za-z0-9 .,_-]{0,80}$/.test(text) && !/[а-яА-ЯёЁ]/.test(text)) {
    const lower = text.toLowerCase();
    if (lower.includes('error') || lower.includes('exception') || lower.includes('failed')) {
      return 'Не удалось выполнить действие. Попробуйте снова.';
    }
  }

  return text;
}

function collectMessageParts(value: unknown, depth = 0): string[] {
  if (depth > 4 || value == null) return [];
  if (typeof value === 'string') {
    const t = value.trim();
    return t ? [t] : [];
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectMessageParts(item, depth + 1));
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Nest validation: { property, constraints: { isEmail: '...' } }
    if (obj.constraints && typeof obj.constraints === 'object') {
      return Object.values(obj.constraints as Record<string, unknown>)
        .flatMap((v) => collectMessageParts(v, depth + 1));
    }
    if (typeof obj.message === 'string' || Array.isArray(obj.message)) {
      return collectMessageParts(obj.message, depth + 1);
    }
    if (obj.children && Array.isArray(obj.children)) {
      return collectMessageParts(obj.children, depth + 1);
    }
  }
  return [];
}

export function extractApiMessage(data?: {
  message?: unknown;
  error?: unknown;
  statusCode?: unknown;
}): string | undefined {
  if (!data) return undefined;

  const fromMessage = collectMessageParts(data.message)
    .map(humanizePart)
    .filter(Boolean);
  if (fromMessage.length) {
    // Уникальные части, без дублей
    return [...new Set(fromMessage)].join('. ');
  }

  if (typeof data.error === 'string' && data.error.trim()) {
    return humanizePart(data.error);
  }

  return undefined;
}

export function messageForStatus(
  status: number,
  data?: { message?: unknown; error?: unknown; statusCode?: unknown },
): string {
  const fromBody = extractApiMessage(data);
  if (fromBody) return fromBody;

  switch (status) {
    case 400:
      return 'Проверьте введённые данные и попробуйте снова.';
    case 401:
      return 'Нужно войти в систему.';
    case 403:
      return 'Недостаточно прав для этого действия.';
    case 404:
      return 'Запрошенные данные не найдены.';
    case 409:
      return 'Такие данные уже используются (например, email или телефон).';
    case 422:
      return 'Данные не прошли проверку. Исправьте поля и отправьте снова.';
    case 429:
      return 'Слишком много запросов. Подождите немного и попробуйте снова.';
    case 500:
      return 'На сервере произошла ошибка. Попробуйте позже или обратитесь к администратору.';
    case 502:
    case 503:
      return 'Сервис временно недоступен. Попробуйте позже.';
    case 504:
      return 'Сервер не ответил вовремя. Попробуйте позже.';
    default:
      if (status >= 500) {
        return 'На сервере произошла ошибка. Попробуйте позже.';
      }
      if (status >= 400) {
        return 'Не удалось выполнить запрос. Проверьте данные и попробуйте снова.';
      }
      return 'Произошла ошибка. Попробуйте снова.';
  }
}

export function getErrorMessage(error: unknown, fallback = 'Произошла ошибка. Попробуйте снова.'): string {
  if (error instanceof ApiError) {
    const msg = humanizePart(error.message || '');
    return msg || fallback;
  }
  if (error instanceof Error) {
    if (isNetworkMessage(error.message)) {
      return 'Нет связи с сервером. Проверьте интернет и попробуйте снова.';
    }
    const msg = humanizePart(error.message || '');
    return msg || fallback;
  }
  if (typeof error === 'string' && error.trim()) {
    return humanizePart(error) || fallback;
  }
  return fallback;
}

export function getErrorStatus(error: unknown): number | undefined {
  return error instanceof ApiError ? error.status : undefined;
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiError) return error.isNetworkError;
  if (error instanceof Error) return isNetworkMessage(error.message);
  return false;
}

export async function parseErrorBody(res: Response): Promise<{ message?: string; error?: string }> {
  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await res.json().catch(() => ({}));
    const extracted = extractApiMessage(data as { message?: unknown; error?: unknown });
    return {
      message: extracted,
      error: typeof (data as { error?: unknown }).error === 'string'
        ? humanizePart((data as { error: string }).error)
        : undefined,
    };
  }

  const text = await res.text().catch(() => '');
  if (!text) return {};
  const trimmed = text.trim().slice(0, 400);
  return { message: humanizePart(trimmed) };
}

export async function throwForResponse(res: Response): Promise<never> {
  const data = await parseErrorBody(res);
  throw new ApiError(messageForStatus(res.status, data), { status: res.status });
}
