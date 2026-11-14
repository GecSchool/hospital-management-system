import { AppError } from '../../../common/errors/index.js';
import { businessDate, validateDate } from '../../../common/utils/time.js';
function parseDate(value: unknown): string {
  if (typeof value !== 'string') throw new AppError(400, 'VALIDATION_ERROR', '날짜가 필요합니다.');
  return validateDate(value);
}
// SCH-03: from/to는 모두 유효한 YYYY-MM-DD이고 시작일은 종료일 이하여야 한다.
export function parseLeaveRange(query: Record<string, unknown>) {
  const from = parseDate(query.from),
    to = parseDate(query.to);
  if (from > to)
    throw new AppError(400, 'VALIDATION_ERROR', '시작일은 종료일보다 늦을 수 없습니다.');
  return { from, to };
}
// SCH-04: 유효한 날짜를 받으며 서울 기준 지난 날짜는 신청할 수 없다.
export function parseLeaveRequest(body: unknown, now: Date = new Date()): string {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !('date' in body))
    throw new AppError(400, 'VALIDATION_ERROR', '휴진 날짜가 필요합니다.');
  const date = parseDate(body.date);
  if (date < businessDate(now))
    throw new AppError(400, 'VALIDATION_ERROR', '지난 날짜는 휴진을 신청할 수 없습니다.');
  return date;
}
