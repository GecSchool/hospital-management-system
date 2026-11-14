// REC-01: 예약 ID 또는 환자·진료과·의사 ID 한 형태만, 추가 필드 없이 허용한다.
export type ReceptionCreateInput =
  { appointmentId: string } | { patientId: string; departmentId: string; doctorId: string };
import { AppError } from '../../../common/errors/index.js';
function id(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256)
    throw new AppError(400, 'VALIDATION_ERROR', '식별자가 올바르지 않습니다.');
  return value;
}
export function parseReceptionCreate(body: unknown): ReceptionCreateInput {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new AppError(400, 'VALIDATION_ERROR', '접수 정보가 올바르지 않습니다.');
  const value = body as Record<string, unknown>,
    keys = Object.keys(value).sort();
  if (keys.length === 1 && keys[0] === 'appointmentId')
    return { appointmentId: id(value.appointmentId) };
  if (keys.length === 3 && keys.join(',') === 'departmentId,doctorId,patientId')
    return {
      patientId: id(value.patientId),
      departmentId: id(value.departmentId),
      doctorId: id(value.doctorId),
    };
  throw new AppError(400, 'VALIDATION_ERROR', '예약 접수 또는 현장 접수 중 하나를 입력하세요.');
}
// REC-04: 접수 ID를 검증한다.
export function parseReceptionId(value: unknown): string {
  return id(value);
}
