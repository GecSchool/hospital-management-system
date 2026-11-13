import axios from 'axios';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
    public requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body = error.response?.data?.error;
    const code = typeof body?.code === 'string' ? body.code : 'REQUEST_FAILED';
    const message =
      status === 401
        ? '로그인 정보를 확인하거나 다시 로그인해 주세요.'
        : status === 403
          ? '이 작업을 수행할 권한이 없습니다.'
          : status === 409
            ? '정보가 변경되었습니다. 새로 조회한 후 다시 시도해 주세요.'
            : status === 404
              ? '요청한 기능을 사용할 수 없습니다.'
              : status === 429
                ? '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
                : '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
    return new ApiError(
      code,
      message,
      status,
      typeof body?.requestId === 'string' ? body.requestId : undefined,
    );
  }
  return new ApiError(
    'UNEXPECTED_ERROR',
    '처리 중 문제가 발생했습니다. 다시 시도해 주세요.',
  );
}
