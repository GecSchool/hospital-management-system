import type { AppointmentDisplayStatus } from '../../appointment/services/appointment-query.service.js';
import { AppError } from '../../../common/errors/index.js';
import { validateDate } from '../../../common/utils/time.js';
export type DoctorPatientsQuery = { date: string; status?: AppointmentDisplayStatus };
// 날짜는 필수이며 화면 상태는 명세의 DisplayStatus 중 하나만 허용한다.
export function parseDoctorPatientsQuery(query: Record<string, unknown>): DoctorPatientsQuery {
  const { date, status } = query;
  if (typeof date !== 'string') throw new AppError(400, 'VALIDATION_ERROR', '날짜가 필요합니다.');
  validateDate(date);
  if (
    status !== undefined &&
    (typeof status !== 'string' ||
      !['BOOKED', 'CANCELLED', 'REGISTERED', 'CALLED', 'IN_PROGRESS', 'COMPLETED'].includes(status))
  )
    throw new AppError(400, 'VALIDATION_ERROR', '상태가 올바르지 않습니다.');
  return { date, status: status as AppointmentDisplayStatus | undefined };
}
