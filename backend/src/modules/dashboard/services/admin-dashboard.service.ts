import type { AccountContext } from '../../../common/middlewares/auth.js';
import { AppError } from '../../../common/errors/index.js';
import { getPrismaClient } from '../../../config/prisma.js';
// DASH-03: 관리자에게 활성 계정 역할별 수와 활성·비활성 진료과 수를 반환한다. 없는 집단은 0이다.
export async function getAdminDashboard(actor: AccountContext) {
  if (actor.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', '관리자 권한이 필요합니다.');
  const db = getPrismaClient();
  const accounts = await db.account.groupBy({
    by: ['role'],
    where: { status: 'ACTIVE' },
    _count: { _all: true },
  });
  const departments = await db.department.groupBy({ by: ['status'], _count: { _all: true } });
  const accountsByRole = { STAFF: 0, DOCTOR: 0, NURSE: 0, ADMIN: 0 };
  const departmentsByStatus = { ACTIVE: 0, INACTIVE: 0 };
  for (const row of accounts) accountsByRole[row.role] = row._count._all;
  for (const row of departments) departmentsByStatus[row.status] = row._count._all;
  return { accountsByRole, departmentsByStatus };
}
