import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import pino from 'pino';

const logger = pino();

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: unknown = null,
  ) {
    super(message);
  }
}

export const requestId: RequestHandler = (_req, res, next) => {
  res.locals.requestId = randomUUID();
  res.setHeader('X-Request-Id', res.locals.requestId);
  next();
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) return next(error);
  let handled: AppError;
  if (error instanceof AppError) handled = error;
  else if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.parse.failed'
  ) {
    handled = new AppError(400, 'VALIDATION_ERROR', '요청 본문이 올바른 JSON이 아닙니다.');
  } else if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.too.large'
  ) {
    handled = new AppError(413, 'PAYLOAD_TOO_LARGE', '요청 본문이 너무 큽니다.');
  } else if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'P2002' || error.code === 'P2003')
  ) {
    handled = new AppError(409, 'CONFLICT', '데이터가 기존 정보와 충돌합니다.');
  } else {
    handled = new AppError(500, 'INTERNAL_ERROR', '서버 오류가 발생했습니다.');
    // 오류 원문·요청 본문을 기록하지 않는다. 민감 정보가 포함될 수 있다.
    logger.error(
      { requestId: res.locals.requestId, code: handled.code },
      'Unhandled request error',
    );
  }
  res.status(handled.status).json({
    error: {
      code: handled.code,
      message: handled.message,
      details: handled.details,
      requestId: res.locals.requestId ?? null,
    },
  });
};
