import type { AccountContext } from '../../../common/middlewares/auth.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { AppError } from '../../../common/errors/index.js';
import { getPrismaClient } from '../../../config/prisma.js';
import { getMedicalPatient } from '../../patient/services/patient.service.js';
import { accountSummarySelect, toAccountSummary } from '../../account/services/account-summary.js';

/** 원본과 정정의 공통 응답에 필요한 실제 작성자의 계정 정보를 가져온다. */
export const clinicalVersionSelect = {
  recordId: true,
  versionNo: true,
  symptoms: true,
  diagnosis: true,
  opinion: true,
  correctionReason: true,
  createdAt: true,
  author: { select: { account: { select: accountSummarySelect } } },
} satisfies Prisma.ClinicalRecordVersionSelect;
type VersionRow = Prisma.ClinicalRecordVersionGetPayload<{ select: typeof clinicalVersionSelect }>;
/** 저장된 버전에서 원본/정정 내용과 작성자·시각의 공통 API 응답을 만든다. */
export function toClinicalVersion(row: VersionRow) {
  return {
    recordId: row.recordId,
    versionNo: row.versionNo,
    symptoms: row.symptoms,
    diagnosis: row.diagnosis,
    opinion: row.opinion,
    correctionReason: row.correctionReason,
    author: toAccountSummary(row.author.account),
    createdAt: row.createdAt.toISOString(),
  };
}
/** 기록에 연결된 환자를 읽고 기존 담당 의사·환자 범위를 검사한다. */
async function requireClinicalAccess(recordId: string, actor: AccountContext) {
  if (actor.role !== 'DOCTOR')
    throw new AppError(403, 'FORBIDDEN', '의사만 진료 기록을 조회할 수 있습니다.');
  const record = await getPrismaClient().clinicalRecord.findUnique({
    where: { id: recordId },
    select: {
      id: true,
      visitId: true,
      visit: { select: { reception: { select: { patientId: true } } } },
    },
  });
  if (!record) throw new AppError(404, 'NOT_FOUND', '진료 기록을 찾을 수 없습니다.');
  await getMedicalPatient(record.visit.reception.patientId, actor);
  return record;
}
/** VIS-05: 환자 접근 권한을 확인하고 최신 진료 기록과 원본·정정 버전 요약을 반환한다. */
export async function getClinicalRecord(recordId: string, actor: AccountContext) {
  const record = await requireClinicalAccess(recordId, actor);
  const db = getPrismaClient();
  // 이력 목록에는 메타데이터만 읽고, 그 목록이 선택한 마지막 버전의 본문만 조회한다.
  // 두 조회 사이에 새 정정이 생겨도 응답의 최신 본문은 같은 응답의 마지막 버전과 일치한다.
  const rows = await db.clinicalRecordVersion.findMany({
    where: { recordId },
    select: {
      versionNo: true,
      createdAt: true,
      author: { select: { account: { select: accountSummarySelect } } },
    },
    orderBy: { versionNo: 'asc' },
  });
  const latestMeta = rows.at(-1);
  if (!latestMeta) throw new AppError(409, 'CONFLICT', '진료 기록 버전이 없습니다.');
  const latest = await db.clinicalRecordVersion.findUnique({
    where: { recordId_versionNo: { recordId, versionNo: latestMeta.versionNo } },
    select: clinicalVersionSelect,
  });
  if (!latest) throw new AppError(409, 'CONFLICT', '진료 기록 버전이 없습니다.');
  return {
    id: record.id,
    visitId: record.visitId,
    latestVersion: toClinicalVersion(latest),
    versions: rows.map((row) => ({
      versionNo: row.versionNo,
      author: toAccountSummary(row.author.account),
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
/** VIS-06: 환자 접근 권한을 확인하고 지정한 원본·정정 버전과 실제 작성자를 반환한다. */
export async function getClinicalVersion(
  recordId: string,
  versionNo: number,
  actor: AccountContext,
) {
  await requireClinicalAccess(recordId, actor);
  const row = await getPrismaClient().clinicalRecordVersion.findUnique({
    where: { recordId_versionNo: { recordId, versionNo } },
    select: clinicalVersionSelect,
  });
  if (!row) throw new AppError(404, 'NOT_FOUND', '진료 기록 버전을 찾을 수 없습니다.');
  return toClinicalVersion(row);
}
