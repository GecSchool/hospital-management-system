import type { AppointmentDisplayStatus } from '../services/appointment-query.service.js';
import { AppError } from '../../../common/errors/index.js';
import { parsePage } from '../../../common/utils/pagination.js';
import { validateDate } from '../../../common/utils/time.js';
export function parseAppointmentId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256)
    throw new AppError(400, 'VALIDATION_ERROR', '예약 ID가 올바르지 않습니다.');
  return value;
}
// APT-02의 선택 검색 조건과 페이지를 검증한다. 날짜는 서울 기준 업무일이다.
export function parseAppointmentQuery(query: Record<string, unknown>): {
  patientId?: string;
  patientName?: string;
  date?: string;
  departmentId?: string;
  doctorId?: string;
  status?: AppointmentDisplayStatus;
  page: number;
  size: number;
  skip: number;
} {
  function text(key: string) {
    const value = query[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || value.length > 256)
      throw new AppError(400, 'VALIDATION_ERROR', `${key} 값이 올바르지 않습니다.`);
    return value.trim() || undefined;
  }
  const patientId = text('patientId'),
    patientName = text('patientName'),
    date = text('date'),
    departmentId = text('departmentId'),
    doctorId = text('doctorId'),
    status = text('status');
  if (date) validateDate(date);
  if (
    status &&
    !['BOOKED', 'CANCELLED', 'REGISTERED', 'CALLED', 'IN_PROGRESS', 'COMPLETED'].includes(status)
  )
    throw new AppError(400, 'VALIDATION_ERROR', 'status 값이 올바르지 않습니다.');
  const pagination = parsePage(query);
  if (pagination.size > 2147483647 || pagination.skip > 2147483647)
    throw new AppError(400, 'VALIDATION_ERROR', '페이지 범위가 너무 큽니다.');
  return {
    patientId,
    patientName,
    date,
    departmentId,
    doctorId,
    status: status as AppointmentDisplayStatus | undefined,
    ...pagination,
  };
}
