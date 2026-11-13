import { AppError } from '../../../common/errors/index.js';
import type { AccountStatus } from '../../../generated/prisma/client.js';

export function parseAccountStatus(body: unknown): AccountStatus {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('status' in body) ||
    (body.status !== 'ACTIVE' && body.status !== 'INACTIVE')
  )
    throw new AppError(400, 'VALIDATION_ERROR', '계정 상태 값이 올바르지 않습니다.');
  return body.status;
}
