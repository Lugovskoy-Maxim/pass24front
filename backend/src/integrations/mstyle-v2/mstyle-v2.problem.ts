import { HttpException } from '@nestjs/common';
import { MSTYLE_PROBLEM_BASE } from './mstyle-v2.constants';

export type ProblemErrorItem = {
  field?: string;
  code?: string;
  message?: string;
};

export type ProblemBody = {
  type: string;
  title: string;
  status: number;
  code: string;
  requestId: string;
  retryable: boolean;
  errors: ProblemErrorItem[];
};

const TITLES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Invalid credentials',
  INVALID_SERVICE_TOKEN: 'Invalid service token',
  INSUFFICIENT_SCOPE: 'Insufficient scope',
  NOT_FOUND: 'Not found',
  IDEMPOTENCY_KEY_REUSED: 'Idempotency key reused',
  IDEMPOTENCY_REPLAY_EXPIRED: 'Idempotency replay expired',
  CHALLENGE_CONSUMED: 'Challenge consumed',
  CHALLENGE_EXPIRED: 'Challenge expired',
  VALIDATION_FAILED: 'Validation failed',
  RATE_LIMITED: 'Rate limited',
  UPSTREAM_UNAVAILABLE: 'Upstream unavailable',
  PRECONDITION_FAILED: 'Precondition failed',
  CONFLICT: 'Conflict',
};

function slug(code: string): string {
  return code.toLowerCase().replace(/_/g, '-');
}

export class ProblemException extends HttpException {
  readonly problemCode: string;
  readonly retryable: boolean;
  readonly errors: ProblemErrorItem[];
  readonly retryAfter?: number;

  constructor(
    status: number,
    code: string,
    options?: {
      title?: string;
      retryable?: boolean;
      errors?: ProblemErrorItem[];
      retryAfter?: number;
    },
  ) {
    const title = options?.title || TITLES[code] || code;
    super(title, status);
    this.problemCode = code;
    this.retryable = options?.retryable ?? (status === 429 || status === 503);
    this.errors = options?.errors ?? [];
    this.retryAfter = options?.retryAfter;
  }

  toBody(requestId: string): ProblemBody {
    return {
      type: `${MSTYLE_PROBLEM_BASE}/${slug(this.problemCode)}`,
      title: this.message,
      status: this.getStatus(),
      code: this.problemCode,
      requestId,
      retryable: this.retryable,
      errors: this.errors,
    };
  }
}

export class OAuthException extends HttpException {
  readonly oauthError: string;
  readonly oauthDescription: string;

  constructor(error: string, description: string, status = 400) {
    super({ error, error_description: description }, status);
    this.oauthError = error;
    this.oauthDescription = description;
  }

  toBody() {
    return {
      error: this.oauthError,
      error_description: this.oauthDescription,
    };
  }
}

export class MstyleResult<T = unknown> {
  constructor(
    public readonly body: T,
    public readonly status = 200,
    public readonly headers: Record<string, string> = {},
  ) {}
}

export function problem(
  status: number,
  code: string,
  options?: ConstructorParameters<typeof ProblemException>[2],
): never {
  throw new ProblemException(status, code, options);
}
