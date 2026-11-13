import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../common/errors/index.js';
import { paginationMeta } from '../../common/utils/pagination.js';
import * as databaseConfig from '../../config/prisma.js';
import type { parseAccountQuery } from './account.validation.js';

const departmentSelect = { id: true, name: true, status: true } as const;
const accountSelect = {
  id: true, name: true, email: true, role: true, status: true,
  doctor: { select: { department: { select: departmentSelect } } },
  nurse: { select: { department: { select: departmentSelect } } },
} satisfies Prisma.AccountSelect;
type AccountRow = Prisma.AccountGetPayload<{ select: typeof accountSelect }>;

function summary(account: AccountRow) {
  return {
    id: account.id, name: account.name, email: account.email, role: account.role, status: account.status,
    department: account.role === 'DOCTOR' ? account.doctor?.department ?? null : account.role === 'NURSE' ? account.nurse?.department ?? null : null,
    doctorId: account.role === 'DOCTOR' ? account.id : null,
  };
}

function escapeLike(value: string): string { return value.replace(/[\\%_]/g, '\\$&'); }

export async function list(query: ReturnType<typeof parseAccountQuery>) {
  const where: Prisma.AccountWhereInput = {
    ...(query.name && { name: { contains: escapeLike(query.name), mode: 'insensitive' } }),
    ...(query.email && { email: { contains: escapeLike(query.email), mode: 'insensitive' } }),
    ...(query.role && { role: query.role }),
    ...(query.status && { status: query.status }),
  };
  const database = databaseConfig.getPrismaClient();
  const [accounts, totalItems] = await Promise.all([
    database.account.findMany({ where, select: accountSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: query.skip, take: query.size }),
    database.account.count({ where }),
  ]);
  return { data: accounts.map(summary), meta: paginationMeta(query.page, query.size, totalItems) };
}

export async function get(id: string) {
  const account = await databaseConfig.getPrismaClient().account.findUnique({ where: { id }, select: accountSelect });
  if (!account) throw new AppError(404, 'NOT_FOUND', '계정을 찾을 수 없습니다.');
  return summary(account);
}
