import type { ReceptionDisplayStatus } from '../services/reception-query.service.js';
import { AppError } from '../../../common/errors/index.js';
import { parsePage } from '../../../common/utils/pagination.js';
import { validateDate } from '../../../common/utils/time.js';
export function parseReceptionId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256)
    throw new AppError(400, 'VALIDATION_ERROR', '접수 ID가 올바르지 않습니다.');
  return value;
}
// REC-02 날짜/환자 조건과 필터 입력을 검증한다.
export function parseReceptionQuery(query: Record<string, unknown>): {
  date?: string;
  patientId?: string;
  departmentId?: string;
  doctorId?: string;
  name?: string;
  birthDate?: string;
  status?: ReceptionDisplayStatus;
  page: number;
  size: number;
  skip: number;
} {
  function text(key: string) {
    const v = query[key];
    if (v === undefined) return undefined;
    if (typeof v !== 'string' || v.length > 256)
      throw new AppError(400, 'VALIDATION_ERROR', `${key} 값이 올바르지 않습니다.`);
    return v.trim() || undefined;
  }
  const date = text('date'),
    patientId = text('patientId'),
    departmentId = text('departmentId'),
    doctorId = text('doctorId'),
    name = text('name'),
    birthDate = text('birthDate'),
    status = text('status');
  if (!date && !patientId)
    throw new AppError(400, 'VALIDATION_ERROR', '날짜 또는 환자 ID가 필요합니다.');
  if (date) validateDate(date);
  if (birthDate) validateDate(birthDate);
  if (status && !['REGISTERED', 'CALLED', 'IN_PROGRESS', 'COMPLETED'].includes(status))
    throw new AppError(400, 'VALIDATION_ERROR', '접수 상태가 올바르지 않습니다.');
  const pagination = parsePage(query);
  if (pagination.size > 2147483647 || pagination.skip > 2147483647)
    throw new AppError(400, 'VALIDATION_ERROR', '페이지 범위가 너무 큽니다.');
  return {
    date,
    patientId,
    departmentId,
    doctorId,
    name,
    birthDate,
    status: status as ReceptionDisplayStatus | undefined,
    ...pagination,
  };
}
