import { AppError } from '../../../common/errors/index.js';
import { parsePage } from '../../../common/utils/pagination.js';
// PAT-07: 공통 페이지 규칙과 DB 정수 범위를 검증한다.
export function parsePatientVisitsQuery(query: Record<string, unknown>) {
  const p = parsePage(query);
  if (p.skip > 2147483647 || p.size > 2147483647)
    throw new AppError(400, 'VALIDATION_ERROR', '페이지 범위가 너무 큽니다.');
  return p;
}
