/**
 * Единый формат ошибок API для клиента.
 * - class-validator → русские формулировки
 * - Mongo duplicate key → 409
 * - Английские «Internal server error» → понятный текст
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

const VALIDATION_RU: Array<[RegExp, string]> = [
  [/must be an email/i, 'Некорректный email'],
  [/should not be empty/i, 'Заполните обязательное поле'],
  [/must be longer than or equal to (\d+)/i, 'Минимум $1 символов'],
  [/must be shorter than or equal to (\d+)/i, 'Не более $1 символов'],
  [/must be a (string|number|boolean|array)/i, 'Некорректный формат данных'],
  [/must match .* regular expression/i, 'Значение в неверном формате'],
  [/property .+ should not exist/i, 'Передано недопустимое поле'],
  [/must be a valid enum value/i, 'Недопустимое значение'],
  [/must be a mongodb id/i, 'Некорректный идентификатор'],
  [/must be a phone number/i, 'Некорректный номер телефона'],
];

function humanizeValidationItem(text: string): string {
  let out = text.trim();
  for (const [re, repl] of VALIDATION_RU) {
    if (re.test(out)) out = out.replace(re, repl);
  }
  // "email must be an email" style → keep field name soft
  out = out.replace(/^(\w+)\s+/i, '');
  return out;
}

function normalizeMessage(message: unknown): string | string[] {
  if (typeof message === 'string') return humanizeValidationItem(message);
  if (Array.isArray(message)) {
    const parts = message.map((item) => {
      if (typeof item === 'string') return humanizeValidationItem(item);
      if (item && typeof item === 'object' && 'constraints' in item) {
        const c = (item as { constraints?: Record<string, string> }).constraints;
        return Object.values(c || {}).map(humanizeValidationItem).join('. ');
      }
      return '';
    }).filter(Boolean);
    return parts.length === 1 ? parts[0] : parts;
  }
  return 'Проверьте введённые данные';
}

function isMongoDuplicate(err: unknown): boolean {
  return !!(err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000);
}

function mongoDuplicateMessage(err: unknown): string {
  const key = String(
    (err as { keyPattern?: Record<string, unknown>; message?: string }).keyPattern
      ? Object.keys((err as { keyPattern: Record<string, unknown> }).keyPattern).join(',')
      : (err as { message?: string }).message || '',
  ).toLowerCase();
  if (key.includes('phone')) return 'Пользователь с таким телефоном уже существует';
  if (key.includes('email')) return 'Пользователь с таким email уже существует';
  if (key.includes('username')) return 'Пользователь с таким логином уже существует';
  return 'Запись с такими данными уже существует';
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (isMongoDuplicate(exception)) {
      return res.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        message: mongoDuplicateMessage(exception),
        error: 'Conflict',
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      let message: string | string[] = exception.message;
      let errorName = HttpStatus[status] || 'Error';

      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const obj = body as { message?: unknown; error?: string };
        if (obj.message !== undefined) message = normalizeMessage(obj.message) as string | string[];
        if (obj.error) errorName = obj.error;
      }

      // Не отдавать клиенту сырые англ. статусы Nest
      if (typeof message === 'string') {
        const m = message.trim();
        if (status >= 500 && /^internal server error$/i.test(m)) {
          message = 'На сервере произошла ошибка. Попробуйте позже или обратитесь к администратору.';
        } else if (status === 401 && (!m || /^unauthorized$/i.test(m))) {
          message = 'Нужно войти в систему или указать верные данные для входа.';
        } else if (status === 403 && (!m || /^forbidden$/i.test(m))) {
          message = 'Недостаточно прав для этого действия.';
        } else if (status === 404 && (!m || /^not found$/i.test(m))) {
          message = 'Запрошенные данные не найдены.';
        } else if (status === 400 && (!m || /^bad request$/i.test(m))) {
          message = 'Проверьте введённые данные и попробуйте снова.';
        }
      }

      if (status >= 500) {
        this.logger.error(
          exception instanceof Error ? exception.stack || exception.message : String(exception),
        );
      }

      return res.status(status).json({
        statusCode: status,
        message,
        error: errorName,
      });
    }

    this.logger.error(
      exception instanceof Error ? exception.stack || exception.message : String(exception),
    );

    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'На сервере произошла ошибка. Попробуйте позже или обратитесь к администратору.',
      error: 'Internal Server Error',
    });
  }
}
