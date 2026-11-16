import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { AppError } from '../../../common/errors/index.js';
import {
  LOGIN_FAILURE_LIMIT_PER_EMAIL,
  LOGIN_FAILURE_LIMIT_PER_IP,
  LOGIN_FAILURE_WINDOW_MS,
  PUBLIC_TOKEN_LIMIT_PER_IP,
  PUBLIC_TOKEN_WINDOW_MS,
} from '../auth-policy.js';

const ip = (req: Request) => ipKeyGenerator(req.ip ?? '');

function limiter(options: {
  windowMs: number;
  limit: number;
  message: string;
  keyGenerator: (req: Request) => string;
  failuresOnly: boolean;
}): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    keyGenerator: options.keyGenerator,
    skipSuccessfulRequests: options.failuresOnly,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // 다른 오류와 같은 형식으로 응답하도록 공통 오류 처리기에 넘긴다.
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', options.message)),
  });
}

export type AuthLimiters = { login: RequestHandler; publicToken: RequestHandler };

/** 횟수는 서버 프로세스 메모리에 기록한다. 앱마다 따로 만들어 서로 영향을 주지 않는다. */
export function createAuthLimiters(): AuthLimiters {
  const message = '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  // 한 IP에서 여러 이메일을 돌아가며 시도하는 경우
  const perIp = limiter({
    windowMs: LOGIN_FAILURE_WINDOW_MS,
    limit: LOGIN_FAILURE_LIMIT_PER_IP,
    message,
    keyGenerator: ip,
    failuresOnly: true,
  });
  // 한 이메일의 비밀번호를 반복해서 추측하는 경우
  const perEmail = limiter({
    windowMs: LOGIN_FAILURE_WINDOW_MS,
    limit: LOGIN_FAILURE_LIMIT_PER_EMAIL,
    message,
    keyGenerator: (req) => {
      const email: unknown = (req.body as { email?: unknown } | undefined)?.email;
      const text = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : '';
      return `${ip(req)}|${text}`;
    },
    failuresOnly: true,
  });
  return {
    // 두 제한을 차례로 통과해야 로그인 처리로 넘어간다.
    login: (req, res, next) =>
      perIp(req, res, (error?: unknown) => (error ? next(error) : perEmail(req, res, next))),
    publicToken: limiter({
      windowMs: PUBLIC_TOKEN_WINDOW_MS,
      limit: PUBLIC_TOKEN_LIMIT_PER_IP,
      message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
      keyGenerator: ip,
      failuresOnly: false,
    }),
  };
}
