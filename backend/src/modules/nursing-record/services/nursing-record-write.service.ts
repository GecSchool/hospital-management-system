import type { AccountContext } from '../../../common/middlewares/auth.js';
import type {
  NursingCreate,
  NursingCorrection,
} from '../validations/nursing-record-write.validation.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { AppError } from '../../../common/errors/index.js';
import { getPrismaClient } from '../../../config/prisma.js';
import {
  lockAccountStatus,
  lockDoctorWork,
} from '../../medical-staff/services/doctor-work-lock.js';
import { accountSummarySelect, toAccountSummary } from '../../account/services/account-summary.js';
import { nursingVersionSelect, toNursingVersion } from './nursing-record-query.service.js';
async function lockReception(tx: Prisma.TransactionClient, actor: AccountContext, id: string) {
  const account = await tx.account.findUnique({
    where: { id: actor.id },
    select: { status: true, role: true, nurse: { select: { departmentId: true } } },
  });
  if (!account || account.status !== 'ACTIVE')
    throw new AppError(403, 'ACCOUNT_INACTIVE', '비활성 계정입니다.');
  if (actor.role !== 'NURSE' || account.role !== 'NURSE' || !account.nurse)
    throw new AppError(403, 'FORBIDDEN', '간호사만 기록할 수 있습니다.');
  const initial = await tx.reception.findUnique({
    where: { id },
    select: { doctorAccountId: true },
  });
  if (!initial) throw new AppError(404, 'NOT_FOUND', '접수를 찾을 수 없습니다.');
  await lockDoctorWork(tx, initial.doctorAccountId);
  await tx.$queryRaw`SELECT id FROM "receptions" WHERE id = ${id} FOR UPDATE`;
  const reception = await tx.reception.findUnique({
    where: { id },
    select: { departmentId: true, receivedAt: true },
  });
  if (!reception) throw new AppError(404, 'NOT_FOUND', '접수를 찾을 수 없습니다.');
  if (reception.departmentId !== account.nurse.departmentId)
    throw new AppError(403, 'FORBIDDEN', '본인 진료과의 접수만 기록할 수 있습니다.');
  return reception;
}
// NUR-02: 같은 과 간호사가 접수 잠금 아래 기록·원본 1을 원자적으로 생성한다.
export async function createNursingRecord(
  actor: AccountContext,
  receptionId: string,
  input: NursingCreate,
) {
  return getPrismaClient().$transaction(async (tx) => {
    await lockAccountStatus(tx);
    const reception = await lockReception(tx, actor, receptionId);
    const record = await tx.nursingRecord.create({
      data: { receptionId, originalAuthorAccountId: actor.id },
      select: {
        id: true,
        receptionId: true,
        originalAuthor: { select: { account: { select: accountSummarySelect } } },
      },
    });
    const version = await tx.nursingRecordVersion.create({
      data: {
        recordId: record.id,
        versionNo: 1,
        content: input.content,
        correctionReason: null,
        authorAccountId: actor.id,
      },
      select: nursingVersionSelect,
    });
    return {
      id: record.id,
      receptionId: record.receptionId,
      receivedAt: reception.receivedAt.toISOString(),
      author: toAccountSummary(record.originalAuthor.account),
      createdAt: version.createdAt.toISOString(),
      latestVersion: toNursingVersion(version),
    };
  });
}
// NUR-05: 같은 과의 어느 간호사든 기존 작성자는 보존하고 최신 버전 확인 후 정정 버전을 생성한다.
export async function correctNursingRecord(
  actor: AccountContext,
  recordId: string,
  input: NursingCorrection,
) {
  try {
    return await getPrismaClient().$transaction(async (tx) => {
      await lockAccountStatus(tx);
      const record = await tx.nursingRecord.findUnique({
        where: { id: recordId },
        select: { receptionId: true },
      });
      if (!record) throw new AppError(404, 'NOT_FOUND', '간호기록을 찾을 수 없습니다.');
      await lockReception(tx, actor, record.receptionId);
      const latest = await tx.nursingRecordVersion.findFirst({
        where: { recordId },
        orderBy: { versionNo: 'desc' },
        select: { versionNo: true },
      });
      if (!latest || latest.versionNo !== input.baseVersionNo)
        throw new AppError(409, 'VERSION_CONFLICT', '기록이 변경되어 다시 확인해야 합니다.');
      const version = await tx.nursingRecordVersion.create({
        data: {
          recordId,
          versionNo: latest.versionNo + 1,
          content: input.content,
          correctionReason: input.correctionReason,
          authorAccountId: actor.id,
        },
        select: nursingVersionSelect,
      });
      return toNursingVersion(version);
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
      throw new AppError(409, 'VERSION_CONFLICT', '기록이 변경되어 다시 확인해야 합니다.');
    throw error;
  }
}
