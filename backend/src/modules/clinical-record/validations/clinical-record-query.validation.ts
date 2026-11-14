import { AppError } from '../../../common/errors/index.js';
/** 1 이상의 DB 정수 범위 버전 번호를 해석한다. 유효하지 않으면 400이다. */
export function parseClinicalVersionNo(value: unknown): number {
  if (
    typeof value !== 'string' ||
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 1 ||
    Number(value) > 2147483647
  )
    throw new AppError(400, 'VALIDATION_ERROR', '진료 기록 버전이 올바르지 않습니다.');
  return Number(value);
}
