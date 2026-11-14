import { AppError } from '../../../common/errors/index.js';
import { validateDate } from '../../../common/utils/time.js';
import { parseAccountId } from '../../account/validations/account-query.validation.js';
/** 필수 YYYY-MM-DD와 선택적 불투명 예약 ID를 검증한다. 잘못된 입력은 400이다. */
export function parseSlotQuery(query: Record<string, unknown>): {
  date: string;
  excludeAppointmentId?: string;
} {
  if (typeof query.date !== 'string')
    throw new AppError(400, 'VALIDATION_ERROR', '예약 날짜가 필요합니다.');
  const date = validateDate(query.date);
  const excludeAppointmentId =
    query.excludeAppointmentId === undefined
      ? undefined
      : parseAccountId(query.excludeAppointmentId);
  return { date, ...(excludeAppointmentId && { excludeAppointmentId }) };
}
