import { AppError } from '../../../common/errors/index.js';
// VIS-02의 경로 진료 ID를 검증한다.
export function parseVisitId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256)
    throw new AppError(400, 'VALIDATION_ERROR', '진료 ID가 올바르지 않습니다.');
  return value;
}
