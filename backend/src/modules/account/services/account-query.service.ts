import type { Prisma } from '../../../generated/prisma/client.js';
import { AppError } from '../../../common/errors/index.js';
import { paginationMeta } from '../../../common/utils/pagination.js';
import * as databaseConfig from '../../../config/prisma.js';
import type { parseAccountQuery } from '../validations/account-query.validation.js';
import { accountSummarySelect, toAccountSummary } from './account-summary.js';

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export async function list(query: ReturnType<typeof parseAccountQuery>) {
  const where: Prisma.AccountWhereInput = {
    ...(query.name && { name: { contains: escapeLike(query.name), mode: 'insensitive' } }),
    ...(query.email && { email: { contains: escapeLike(query.email), mode: 'insensitive' } }),
    ...(query.role && { role: query.role }),
    ...(query.status && { status: query.status }),
  };
  const database = databaseConfig.getPrismaClient();
  const [accounts, totalItems] = await Promise.all([
    database.account.findMany({
      where,
      select: accountSummarySelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: query.skip,
      take: query.size,
    }),
    database.account.count({ where }),
  ]);
  return {
    data: accounts.map(toAccountSummary),
    meta: paginationMeta(query.page, query.size, totalItems),
  };
}

export async function get(id: string) {
  const account = await databaseConfig
    .getPrismaClient()
    .account.findUnique({ where: { id }, select: accountSummarySelect });
  if (!account) throw new AppError(404, 'NOT_FOUND', '계정을 찾을 수 없습니다.');
  return toAccountSummary(account);
}
