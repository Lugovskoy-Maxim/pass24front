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
];

function isNetworkMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return NETWORK_ERROR_MARKERS.some((marker) => lower.includes(marker));
}

function extractApiMessage(data?: { message?: unknown; error?: unknown }): string | undefined {
  if (!data) return undefined;
  if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();
  if (Array.isArray(data.message)) {
    const parts = data.message
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'message' in item) {
          const m = (item as { message?: unknown }).message;
          return typeof m === 'string' ? m : '';
        }
        return '';
      })
      .filter(Boolean);
    if (parts.length) return parts.join('. ');
  }
  if (typeof data.error === 'string' && data.error.trim()) return data.error.trim();
  return undefined;
}

export function messageForStatus(status: number, data?: { message?: unknown; error?: unknown }): string {
  const fromBody = extractApiMessage(data);
  if (fromBody) return fromBody;

  switch (status) {
    case 400:
      return 'Некорректный запрос';
    case 401:
      return 'Требуется авторизация';
    case 403:
      return 'Нет доступа к этому действию';
    case 404:
      return 'Данные не найдены';
    case 409:
      return 'Пользователь с таким email или телефоном уже существует';
    case 422:
      return 'Ошибка проверки данных';
    case 429:
      return 'Слишком много запросов. Подождите немного';
    case 500:
      return 'Внутренняя ошибка сервера';
    case 502:
      return 'Сервер временно недоступен (502)';
    case 503:
      return 'Сервис временно недоступен (503)';
    case 504:
      return 'Сервер не ответил вовремя (504)';
    default:
      return status >= 500
        ? `Ошибка сервера (${status})`
        : `Ошибка запроса (${status})`;
  }
}

export function getErrorMessage(error: unknown, fallback = 'Произошла ошибка'): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) {
    if (isNetworkMessage(error.message)) {
      return 'Сервер недоступен. Проверьте подключение к сети и что backend запущен.';
    }
    return error.message || fallback;
  }
  if (typeof error === 'string' && error.trim()) return error;
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
        ? (data as { error: string }).error
        : undefined,
    };
  }

  const text = await res.text().catch(() => '');
  if (!text) return {};
  const trimmed = text.trim().slice(0, 240);
  return { message: trimmed };
}

export async function throwForResponse(res: Response): Promise<never> {
  const data = await parseErrorBody(res);
  throw new ApiError(messageForStatus(res.status, data), { status: res.status });
}