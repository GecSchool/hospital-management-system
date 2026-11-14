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
type NursingRow = Prisma.NursingRecordGetPayload<{ select: typeof nursingRecordSelect }>;
export function toNursingRecord(row: NursingRow) {
  const original = row.versions[0],
    latest = row.versions.at(-1);
  if (!original || original.versionNo !== 1 || !latest)
    throw new AppError(409, 'CONFLICT', '간호 기록 원본이 없습니다.');
  return {
    id: row.id,
    receptionId: row.receptionId,
    receivedAt: row.reception.receivedAt.toISOString(),
    author: toAccountSummary(row.originalAuthor.account),
    createdAt: original.createdAt.toISOString(),
    latestVersion: toNursingVersion(latest),
  };
}
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
  const rows = await getPrismaClient().nursingRecordVersion.findMany({
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
    select: { recordId: true, createdAt: true, record: { select: nursingRecordSelect } },
  });
  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit).reverse();
  return {
    data: page.map((row) => toNursingRecord(row.record)),
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
  const record = await getPrismaClient().nursingRecord.findUnique({
    where: { id: recordId },
    select: nursingRecordSelect,
  });
  if (!record) throw new AppError(404, 'NOT_FOUND', '간호 기록을 찾을 수 없습니다.');
  await requireReceptionAccess(actor, record.receptionId);
  return record;
}
// NUR-03: 권한이 있는 사용자에게 최신 버전과 원본부터의 버전 이력 요약을 제공한다.
export async function getNursingRecord(actor: AccountContext, recordId: string) {
  const record = await requireRecordAccess(actor, recordId);
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
