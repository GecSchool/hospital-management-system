import type { Role } from '../../../generated/prisma/client.js';
import { AppError } from '../../../common/errors/index.js';
import { parsePage } from '../../../common/utils/pagination.js';

const roles: Role[] = ['STAFF', 'DOCTOR', 'NURSE', 'ADMIN'];

export function parseDepartmentId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) {
    throw new AppError(400, 'VALIDATION_ERROR', '진료과 ID가 올바르지 않습니다.');
  }
  return value;
}

export function parseMedicalStaffQuery(query: Record<string, unknown>) {
  const value = query.role;
  if (value !== undefined && typeof value !== 'string') throw new AppError(400, 'VALIDATION_ERROR', 'role 값이 올바르지 않습니다.');
  const role = value?.trim() || undefined;
  if (role && !roles.includes(role as Role)) throw new AppError(400, 'VALIDATION_ERROR', 'role 값이 올바르지 않습니다.');
  const pagination = parsePage(query);
  if (pagination.size > 2147483647 || pagination.skip > 2147483647) {
    throw new AppError(400, 'VALIDATION_ERROR', '페이지 범위가 너무 큽니다.');
  }
  return { ...(role && { role: role as Role }), ...pagination };
}

export function parseDoctorsQuery(query: Record<string, unknown>) {
  if (query.activeOnly === undefined) return {};
  if (query.activeOnly === 'true') return { activeOnly: true };
  if (query.activeOnly === 'false') return { activeOnly: false };
  throw new AppError(400, 'VALIDATION_ERROR', 'activeOnly 값은 true 또는 false여야 합니다.');
}
