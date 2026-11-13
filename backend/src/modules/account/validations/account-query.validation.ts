import type { AccountStatus, Role } from '../../../generated/prisma/client.js';
import { AppError } from '../../../common/errors/index.js';
import { parsePage } from '../../../common/utils/pagination.js';

const roles: Role[] = ['STAFF', 'DOCTOR', 'NURSE', 'ADMIN'];
const statuses: AccountStatus[] = ['ACTIVE', 'INACTIVE'];

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new AppError(400, 'VALIDATION_ERROR', `${field} 값이 올바르지 않습니다.`);
  const text = value.trim();
  if (text.length > 256) throw new AppError(400, 'VALIDATION_ERROR', `${field} 값이 너무 깁니다.`);
  return text || undefined;
}

export function parseAccountQuery(query: Record<string, unknown>) {
  const name = optionalText(query.name, 'name');
  const email = optionalText(query.email, 'email');
  const role = optionalText(query.role, 'role');
  const status = optionalText(query.status, 'status');
  if (role && !roles.includes(role as Role)) throw new AppError(400, 'VALIDATION_ERROR', 'role 값이 올바르지 않습니다.');
  if (status && !statuses.includes(status as AccountStatus)) throw new AppError(400, 'VALIDATION_ERROR', 'status 값이 올바르지 않습니다.');
  const pagination = parsePage(query);
  if (pagination.size > 2147483647 || pagination.skip > 2147483647) throw new AppError(400, 'VALIDATION_ERROR', '페이지 범위가 너무 큽니다.');
  return { ...(name && { name }), ...(email && { email }), ...(role && { role: role as Role }), ...(status && { status: status as AccountStatus }), ...pagination };
}

export function parseAccountId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) throw new AppError(400, 'VALIDATION_ERROR', '계정 ID가 올바르지 않습니다.');
  return value;
}
