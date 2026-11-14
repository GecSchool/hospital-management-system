import type { AccountContext } from '../../../common/middlewares/auth.js';
import type { parseNursingHistoryQuery } from '../validations/nursing-history.validation.js';
import { AppError } from '../../../common/errors/index.js';
import { encodeCursor } from '../../../common/utils/cursor.js';
import { getPrismaClient } from '../../../config/prisma.js';
import { nursingListPageSelect, hydrateNursingListPage } from './nursing-record-query.service.js';
/** NUR-06: 선택 접수의 환자와 간호사 소속 과를 검증하고, 같은 환자·과의 모든 간호기록을 반환한다.
 * 선택 접수 전후 날짜를 모두 포함하고 최신 limit 묶음 안에서는 최초 작성시각·ID의 과거→현재 순이다. */
export async function getNursingHistory(
  patientId: string,
  actor: AccountContext,
  query: ReturnType<typeof parseNursingHistoryQuery>,
) {
  if (actor.role !== 'NURSE' || !actor.departmentId)
    throw new AppError(403, 'FORBIDDEN', '간호사 권한과 소속 진료과가 필요합니다.');
  const db = getPrismaClient();
  const selected = await db.reception.findUnique({
    where: { id: query.receptionId },
    select: { patientId: true, departmentId: true },
  });
  if (!selected || selected.patientId !== patientId)
    throw new AppError(404, 'NOT_FOUND', '환자와 일치하는 접수를 찾을 수 없습니다.');
  if (selected.departmentId !== actor.departmentId)
    throw new AppError(403, 'FORBIDDEN', '본인 진료과의 접수만 조회할 수 있습니다.');
  const before = query.before ? new Date(query.before.at) : undefined;
  const rows = await db.nursingRecordVersion.findMany({
    where: {
      versionNo: 1,
      record: { reception: { patientId, departmentId: actor.departmentId } },
      ...(before && {
        OR: [
          { createdAt: { lt: before } },
          { createdAt: before, recordId: { lt: query.before!.id } },
        ],
      }),
    },
    select: nursingListPageSelect,
    orderBy: [{ createdAt: 'desc' }, { recordId: 'desc' }],
    take: query.limit + 1,
  });
  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit).reverse();
  const oldest = page[0];
  return {
    data: await hydrateNursingListPage(db, page),
    meta: {
      nextBefore:
        hasMore && oldest
          ? encodeCursor({ at: oldest.createdAt.toISOString(), id: oldest.recordId })
          : null,
      hasMore,
    },
  };
}
