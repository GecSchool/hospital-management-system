import type { AccountContext } from '../../../common/middlewares/auth.js';
import type { parseClinicalHistoryQuery } from '../validations/clinical-history.validation.js';
import { AppError } from '../../../common/errors/index.js';
import { encodeCursor } from '../../../common/utils/cursor.js';
import { getPrismaClient } from '../../../config/prisma.js';
import { getMedicalPatient } from '../../patient/services/patient.service.js';
/** VIS-03: 의사의 예약·접수 환자의 모든 완료 진료를 조회한다. 최신 묶음부터 가져오되
 * 각 묶음은 완료일시·고유 ID의 과거→현재 순이며 summary는 최신 진료 기록 진단이다.
 * before는 마지막 묶음의 가장 오래된 (완료일시,진료ID), 추가 이력 없으면 null이다. */
export async function getClinicalHistory(
  patientId: string,
  actor: AccountContext,
  query: ReturnType<typeof parseClinicalHistoryQuery>,
) {
  if (actor.role !== 'DOCTOR')
    throw new AppError(403, 'FORBIDDEN', '의사만 진료 이력을 조회할 수 있습니다.');
  await getMedicalPatient(patientId, actor);
  const before = query.before ? new Date(query.before.at) : undefined;
  const rows = await getPrismaClient().visit.findMany({
    where: {
      status: 'COMPLETED',
      completedAt: { not: null },
      reception: { patientId },
      clinicalRecord: { isNot: null },
      ...(before && {
        OR: [
          { completedAt: { lt: before } },
          { completedAt: before, id: { lt: query.before!.id } },
        ],
      }),
    },
    select: {
      id: true,
      receptionId: true,
      completedAt: true,
      reception: {
        select: {
          department: { select: { id: true, name: true, status: true } },
          doctor: {
            select: {
              accountId: true,
              account: { select: { name: true } },
              department: { select: { id: true, name: true, status: true } },
            },
          },
        },
      },
      clinicalRecord: { select: { id: true } },
    },
    orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
  });
  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit).reverse();
  const recordIds = page.map((row) => {
    if (!row.completedAt || !row.clinicalRecord)
      throw new AppError(409, 'CONFLICT', '완료 진료 기록이 올바르지 않습니다.');
    return row.clinicalRecord.id;
  });
  const db = getPrismaClient();
  const diagnoses = new Map<string, string>();
  // 요청한 limit에 상한을 새로 추가하지 않고 DB 바인딩 개수를 묶음별로 제한한다.
  const batchSize = 1000;
  for (let offset = 0; offset < recordIds.length; offset += batchSize) {
    const ids = recordIds.slice(offset, offset + batchSize);
    const grouped = await db.clinicalRecordVersion.groupBy({
      by: ['recordId'],
      where: { recordId: { in: ids } },
      _max: { versionNo: true },
    });
    if (grouped.length !== ids.length)
      throw new AppError(409, 'CONFLICT', '완료 진료 기록이 올바르지 않습니다.');
    const selected = grouped.map((row) => {
      if (row._max.versionNo === null)
        throw new AppError(409, 'CONFLICT', '완료 진료 기록이 올바르지 않습니다.');
      return { recordId: row.recordId, versionNo: row._max.versionNo };
    });
    // 선택 후 새 정정이 생겨도 정확한 복합키를 조회해 해당 시점의 진단을 일관되게 반환한다.
    const latest = await db.clinicalRecordVersion.findMany({
      where: { OR: selected },
      select: { recordId: true, versionNo: true, diagnosis: true },
    });
    for (const version of latest) diagnoses.set(version.recordId, version.diagnosis);
  }
  const data = page.map((row) => {
    if (!row.completedAt || !row.clinicalRecord || !diagnoses.has(row.clinicalRecord.id))
      throw new AppError(409, 'CONFLICT', '완료 진료 기록이 올바르지 않습니다.');
    return {
      visitId: row.id,
      receptionId: row.receptionId,
      clinicalRecordId: row.clinicalRecord.id,
      department: row.reception.department,
      doctor: {
        id: row.reception.doctor.accountId,
        name: row.reception.doctor.account.name,
        department: row.reception.doctor.department,
      },
      completedAt: row.completedAt.toISOString(),
      summary: diagnoses.get(row.clinicalRecord.id)!,
    };
  });
  const oldest = page[0];
  const nextBefore =
    hasMore && oldest?.completedAt
      ? encodeCursor({ at: oldest.completedAt.toISOString(), id: oldest.id })
      : null;
  return { data, meta: { nextBefore, hasMore } };
}
