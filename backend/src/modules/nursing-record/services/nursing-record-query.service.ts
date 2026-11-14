import type { AccountContext } from '../../../common/middlewares/auth.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { parseClinicalHistoryQuery } from '../../clinical-record/validations/clinical-history.validation.js';
import { AppError } from '../../../common/errors/index.js';
import { encodeCursor } from '../../../common/utils/cursor.js';
import { getPrismaClient } from '../../../config/prisma.js';
import { accountSummarySelect, toAccountSummary } from '../../account/services/account-summary.js';
import { getMedicalPatient } from '../../patient/services/patient.service.js';
// NUR 조회 응답은 접수, 최초 작성자와 원본·최신 버전의 정보를 포함한다.
export const nursingVersionSelect = {
  recordId: true,
  versionNo: true,
  content: true,
  correctionReason: true,
  createdAt: true,
  author: { select: { account: { select: accountSummarySelect } } },
} satisfies Prisma.NursingRecordVersionSelect;
type Version = Prisma.NursingRecordVersionGetPayload<{ select: typeof nursingVersionSelect }>;
export function toNursingVersion(v: Version) {
  return {
    recordId: v.recordId,
    versionNo: v.versionNo,
    content: v.content,
    correctionReason: v.correctionReason,
    author: toAccountSummary(v.author.account),
    createdAt: v.createdAt.toISOString(),
  };
}
export const nursingRecordSelect = {
  id: true,
  receptionId: true,
  reception: { select: { receivedAt: true } },
  originalAuthor: { select: { account: { select: accountSummarySelect } } },
  versions: { orderBy: { versionNo: 'asc' }, select: nursingVersionSelect },
} satisfies Prisma.NursingRecordSelect;
async function requireReceptionAccess(actor: AccountContext, receptionId: string) {
  if (actor.role !== 'DOCTOR' && actor.role !== 'NURSE')
    throw new AppError(403, 'FORBIDDEN', '접근 권한이 없습니다.');
  const reception = await getPrismaClient().reception.findUnique({
    where: { id: receptionId },
    select: { patientId: true, departmentId: true },
  });
  if (!reception) throw new AppError(404, 'NOT_FOUND', '접수를 찾을 수 없습니다.');
  if (
    actor.role === 'NURSE' &&
    (!actor.departmentId || actor.departmentId !== reception.departmentId)
  )
    throw new AppError(403, 'FORBIDDEN', '본인 진료과의 기록만 조회할 수 있습니다.');
  if (actor.role === 'DOCTOR') await getMedicalPatient(reception.patientId, actor);
}
// NUR-01: 접수의 진료과와 환자 접근 권한을 검증하고 원본 작성 순서로 커서 페이지를 조회한다.
export async function listNursingRecords(
  actor: AccountContext,
  receptionId: string,
  query: ReturnType<typeof parseClinicalHistoryQuery>,
) {
  await requireReceptionAccess(actor, receptionId);
  const before = query.before;
  const db = getPrismaClient();
  const rows = await db.nursingRecordVersion.findMany({
    where: {
      versionNo: 1,
      record: { receptionId },
      ...(before && {
        OR: [
          { createdAt: { lt: new Date(before.at) } },
          { createdAt: new Date(before.at), recordId: { lt: before.id } },
        ],
      }),
    },
    orderBy: [{ createdAt: 'desc' }, { recordId: 'desc' }],
    take: query.limit + 1,
    select: nursingListPageSelect,
  });
  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit).reverse();
  return {
    data: await hydrateNursingListPage(db, page),
    meta: {
      nextBefore:
        hasMore && page.length
          ? encodeCursor({ at: page[0].createdAt.toISOString(), id: page[0].recordId })
          : null,
      hasMore,
    },
  };
}
async function requireRecordAccess(actor: AccountContext, recordId: string) {
  if (actor.role !== 'DOCTOR' && actor.role !== 'NURSE')
    throw new AppError(403, 'FORBIDDEN', '접근 권한이 없습니다.');
  // 권한을 확인하기 전에는 기록 내용이 아닌 식별 정보만 가져온다.
  const record = await getPrismaClient().nursingRecord.findUnique({
    where: { id: recordId },
    select: { id: true, receptionId: true },
  });
  if (!record) throw new AppError(404, 'NOT_FOUND', '간호 기록을 찾을 수 없습니다.');
  await requireReceptionAccess(actor, record.receptionId);
  return record;
}
// NUR-03: 권한이 있는 사용자에게 최신 버전과 원본부터의 버전 이력 요약을 제공한다.
export async function getNursingRecord(actor: AccountContext, recordId: string) {
  await requireRecordAccess(actor, recordId);
  const record = await getPrismaClient().nursingRecord.findUnique({
    where: { id: recordId },
    select: nursingRecordSelect,
  });
  if (!record) throw new AppError(404, 'NOT_FOUND', '간호 기록을 찾을 수 없습니다.');
  const latest = record.versions.at(-1);
  if (!latest) throw new AppError(409, 'CONFLICT', '간호 기록 버전이 없습니다.');
  return {
    id: record.id,
    receptionId: record.receptionId,
    latestVersion: toNursingVersion(latest),
    versions: record.versions.map((v) => ({
      versionNo: v.versionNo,
      author: toAccountSummary(v.author.account),
      createdAt: v.createdAt.toISOString(),
    })),
  };
}
// NUR-04: 권한이 있는 사용자에게 선택 버전의 본문과 정정 사유를 제공한다.
export async function getNursingVersion(
  actor: AccountContext,
  recordId: string,
  versionNo: number,
) {
  await requireRecordAccess(actor, recordId);
  const v = await getPrismaClient().nursingRecordVersion.findUnique({
    where: { recordId_versionNo: { recordId, versionNo } },
    select: nursingVersionSelect,
  });
  if (!v) throw new AppError(404, 'NOT_FOUND', '간호 기록 버전을 찾을 수 없습니다.');
  return toNursingVersion(v);
}

/** NUR-01/06: 페이지의 원본 버전 행에서 기록·접수·최초 작성자 정보만 선택한다.
 * 본문은 여기서 조회하지 않으며 createdAt은 versionNo=1의 기록 시각이다. */
export const nursingListPageSelect = {
  recordId: true,
  createdAt: true,
  record: {
    select: {
      id: true,
      receptionId: true,
      reception: { select: { receivedAt: true } },
      originalAuthor: { select: { account: { select: accountSummarySelect } } },
    },
  },
} satisfies Prisma.NursingRecordVersionSelect;
type NursingListPageRow = Prisma.NursingRecordVersionGetPayload<{
  select: typeof nursingListPageSelect;
}>;
/** 페이지의 recordId만 최신 버전 번호로 묶어 조회한 후 정확한 (recordId,versionNo)의 본문을 일괄 조회한다.
 * 빈 페이지는 DB를 조회하지 않고, 실제 정정자·원본 작성자·시각·페이지 순서를 보존한다.
 * 버전 불일치 시 기존과 같은 충돌 오류를 반환하며 접근 권한 검사는 호출자가 선행한다. */
export async function hydrateNursingListPage(
  db: Prisma.TransactionClient,
  page: NursingListPageRow[],
) {
  if (!page.length) return [];
  const byRecordId = new Map<string, Version>();
  // API의 limit에 새 상한을 두지 않으면서 PostgreSQL 바인딩 수를 제한한다.
  const batchSize = 1000;
  for (let offset = 0; offset < page.length; offset += batchSize) {
    const batch = page.slice(offset, offset + batchSize);
    const ids = batch.map((row) => row.recordId);
    const grouped = await db.nursingRecordVersion.groupBy({
      by: ['recordId'],
      where: { recordId: { in: ids } },
      _max: { versionNo: true },
    });
    const wanted = grouped.map((row) => {
      if (row._max.versionNo === null)
        throw new AppError(409, 'CONFLICT', '간호 기록 원본이 없습니다.');
      return { recordId: row.recordId, versionNo: row._max.versionNo };
    });
    if (wanted.length !== batch.length)
      throw new AppError(409, 'CONFLICT', '간호 기록 원본이 없습니다.');
    const latest = await db.nursingRecordVersion.findMany({
      where: { OR: wanted },
      select: nursingVersionSelect,
    });
    for (const version of latest) byRecordId.set(version.recordId, version);
  }
  return page.map((row) => {
    const version = byRecordId.get(row.recordId);
    if (!version) throw new AppError(409, 'CONFLICT', '간호 기록 원본이 없습니다.');
    return {
      id: row.record.id,
      receptionId: row.record.receptionId,
      receivedAt: row.record.reception.receivedAt.toISOString(),
      author: toAccountSummary(row.record.originalAuthor.account),
      createdAt: row.createdAt.toISOString(),
      latestVersion: toNursingVersion(version),
    };
  });
}
