import { AppError } from '../../../common/errors/index.js';
import { businessDate, validateDate } from '../../../common/utils/time.js';
// DASH-01: 선택 날짜는 YYYY-MM-DD를 검증하고 미입력 시 서울의 오늘 날짜를 사용한다.
export function parseStaffDashboardDate(query: Record<string, unknown>, now = new Date()): string {
  const date = query.date;
  if (date === undefined) return businessDate(now);
  if (typeof date !== 'string')
    throw new AppError(400, 'VALIDATION_ERROR', '날짜 형식이 올바르지 않습니다.');
  return validateDate(date);
}
