import { AppError } from '../../../common/errors/index.js';
import { validateDate } from '../../../common/utils/time.js';
function object(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new AppError(400, 'VALIDATION_ERROR', '요청 본문이 올바르지 않습니다.');
  return body as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256)
    throw new AppError(400, 'VALIDATION_ERROR', '식별자가 올바르지 않습니다.');
  return value;
}
// APT-04: 유효한 날짜 및 오프셋이 포함된 ISO 8601 일시를 검증한다.
export function parseAppointmentTime(body: unknown): Date {
  const value = object(body).startsAt;
  if (typeof value !== 'string')
    throw new AppError(400, 'VALIDATION_ERROR', '예약 시각이 필요합니다.');
  const m =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!m)
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      '예약 시각은 오프셋이 포함된 날짜·시각이어야 합니다.',
    );
  validateDate(m[1]);
  if (Number(m[2]) > 23 || Number(m[3]) > 59 || Number(m[4] ?? 0) > 59)
    throw new AppError(400, 'VALIDATION_ERROR', '예약 시각이 올바르지 않습니다.');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new AppError(400, 'VALIDATION_ERROR', '예약 시각이 올바르지 않습니다.');
  return date;
}
// APT-01: 환자·진료과·의사 ID와 UTC 오프셋을 포함하는 예약 일시를 검증한다.
export function parseAppointmentCreate(body: unknown) {
  const value = object(body);
  return {
    patientId: id(value.patientId),
    departmentId: id(value.departmentId),
    doctorId: id(value.doctorId),
    startsAt: parseAppointmentTime(body),
  };
}
export function parseAppointmentId(value: unknown): string {
  return id(value);
}
