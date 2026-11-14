import type { AccountContext } from '../../../common/middlewares/auth.js';
import { AppError } from '../../../common/errors/index.js';
import { paginationMeta } from '../../../common/utils/pagination.js';
import { getPrismaClient } from '../../../config/prisma.js';

// PAT-07: 직원에게 환자의 완료된 진료를 페이지 단위의 본문 없는 요약으로 반환한다.
// 환자가 존재하지 않거나 요청자의 역할이 직원이 아니면 오류를 반환한다.
export async function listPatientVisits(
  actor: AccountContext,
  patientId: string,
  page: number,
  size: number,
) {
  if (actor.role !== 'STAFF') throw new AppError(403, 'FORBIDDEN', '접근 권한이 없습니다.');
  const db = getPrismaClient();
  if (!(await db.patient.findUnique({ where: { id: patientId }, select: { id: true } })))
    throw new AppError(404, 'NOT_FOUND', '환자를 찾을 수 없습니다.');
  const where = { status: 'COMPLETED' as const, reception: { patientId } };
  const totalItems = await db.visit.count({ where });
  const visits = await db.visit.findMany({
    where,
    orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * size,
    take: size,
    select: {
      id: true,
      completedAt: true,
      reception: {
        select: {
          patientId: true,
          department: { select: { id: true, name: true } },
          doctor: { select: { accountId: true, account: { select: { name: true } } } },
        },
      },
    },
  });
  return {
    data: visits.map((v) => ({
      visitId: v.id,
      patientId: v.reception.patientId,
      department: v.reception.department,
      doctor: { id: v.reception.doctor.accountId, name: v.reception.doctor.account.name },
      completedAt: v.completedAt,
      displayStatus: 'COMPLETED' as const,
    })),
    meta: paginationMeta(page, size, totalItems),
  };
}
