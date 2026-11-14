import { AppError } from '../../../common/errors/index.js';
import { decodeCursor } from '../../../common/utils/cursor.js';
/** limit 양수 및 before 불투명 커서를 검증하며 기본 limit은 20이다. 유효하지 않으면 400. */
export function parseClinicalHistoryQuery(query: Record<string, unknown>): {
  limit: number;
  before?: { at: string; id: string };
} {
  const input = query.limit;
  if (
    input !== undefined &&
    (typeof input !== 'string' ||
      !/^\d+$/.test(input) ||
      !Number.isSafeInteger(Number(input)) ||
      Number(input) < 1 ||
      Number(input) >= 2147483647)
  )
    throw new AppError(400, 'VALIDATION_ERROR', '이력 조회 건수가 올바르지 않습니다.');
  if (query.before !== undefined && typeof query.before !== 'string')
    throw new AppError(400, 'VALIDATION_ERROR', '커서가 올바르지 않습니다.');
  return {
    limit: input === undefined ? 20 : Number(input),
    ...(query.before !== undefined && { before: decodeCursor(query.before as string) }),
  };
}
