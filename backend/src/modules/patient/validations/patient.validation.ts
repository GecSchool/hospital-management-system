import { AppError } from '../../../common/errors/index.js';
import { parsePage } from '../../../common/utils/pagination.js';
import { validateDate } from '../../../common/utils/time.js';
import { parseResidentNumber } from '../services/resident-number.js';

function optionalText(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 256)
    throw new AppError(400, 'VALIDATION_ERROR', `${name} 값이 올바르지 않습니다.`);
  return value.trim() || undefined;
}
function requiredText(value: unknown, name: string): string {
  const result = optionalText(value, name);
  if (!result) throw new AppError(400, 'VALIDATION_ERROR', `${name} 값이 필요합니다.`);
  return result;
}
function validatePhone(phone: string) {
  if (phone.length > 20 || !/^\+?\d+(?:-\d+)*$/.test(phone) || phone.replace(/\D/g, '').length < 7)
    throw new AppError(400, 'VALIDATION_ERROR', '연락처 형식이 올바르지 않습니다.');
}
export function parsePatientCreate(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new AppError(400, 'VALIDATION_ERROR', '요청 본문이 필요합니다.');
  const value = body as Record<string, unknown>;
  const name = requiredText(value.name, 'name');
  const phone = requiredText(value.phone, 'phone');
  validatePhone(phone);
  return { name, phone, ...parseResidentNumber(value.residentNumber) };
}
export function parsePatientQuery(query: Record<string, unknown>) {
  const name = optionalText(query.name, 'name');
  const phone = optionalText(query.phone, 'phone');
  const patientNumber = optionalText(query.patientNumber, 'patientNumber');
  const birthDate = optionalText(query.birthDate, 'birthDate');
  if (birthDate) validateDate(birthDate);
  const pagination = parsePage(query);
  if (pagination.skip > 2147483647 || pagination.size > 2147483647)
    throw new AppError(400, 'VALIDATION_ERROR', '페이지 범위가 너무 큽니다.');
  return { name, phone, patientNumber, birthDate, ...pagination };
}

export function parsePatientId(value: unknown) {
  return requiredText(value, 'patientId');
}
export function parsePatientUpdate(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new AppError(400, 'VALIDATION_ERROR', '요청 본문이 필요합니다.');
  const value = body as Record<string, unknown>;
  const residentNumber =
    'residentNumber' in value ? parseResidentNumber(value.residentNumber) : undefined;
  const name = value.name === undefined ? undefined : requiredText(value.name, 'name');
  const phone = value.phone === undefined ? undefined : requiredText(value.phone, 'phone');
  if (phone) validatePhone(phone);
  return { name, phone, residentNumber };
}
