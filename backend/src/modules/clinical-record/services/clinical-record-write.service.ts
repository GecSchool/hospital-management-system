import type { AccountContext } from '../../../common/middlewares/auth.js';
import type {
  ClinicalFields,
  CorrectionFields,
} from '../validations/clinical-record-write.validation.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { AppError } from '../../../common/errors/index.js';
import { getPrismaClient } from '../../../config/prisma.js';
import {
  lockAccountStatus,
  lockDoctorWork,
} from '../../medical-staff/services/doctor-work-lock.js';
import { visitSelect, toVisit } from '../../visit/services/visit-query.service.js';
import { clinicalVersionSelect, toClinicalVersion } from './clinical-record-query.service.js';
async function lockVisit(tx: Prisma.TransactionClient, actor: AccountContext, visitId: string) {
  const actorRow = await tx.account.findUnique({
    where: { id: actor.id },
    select: { status: true, role: true },
  });
  if (!actorRow || actorRow.status !== 'ACTIVE')
    throw new AppError(403, 'ACCOUNT_INACTIVE', '비활성 계정입니다.');
  if (actorRow.role !== 'DOCTOR' || actor.role !== 'DOCTOR')
    throw new AppError(403, 'FORBIDDEN', '의사만 접근할 수 있습니다.');
  const visit = await tx.visit.findUnique({
    where: { id: visitId },
    select: { receptionId: true, reception: { select: { doctorAccountId: true } } },
  });
  if (!visit) throw new AppError(404, 'NOT_FOUND', '진료를 찾을 수 없습니다.');
  if (visit.reception.doctorAccountId !== actor.id)
    throw new AppError(403, 'FORBIDDEN', '담당 의사만 기록할 수 있습니다.');
  await lockDoctorWork(tx, actor.id);
  await tx.$queryRaw`SELECT id FROM "receptions" WHERE id = ${visit.receptionId} FOR UPDATE`;
  const current = await tx.visit.findUnique({
    where: { id: visitId },
    select: { id: true, status: true, reception: { select: { doctorAccountId: true } } },
  });
  if (!current) throw new AppError(404, 'NOT_FOUND', '진료를 찾을 수 없습니다.');
  if (current.reception.doctorAccountId !== actor.id)
    throw new AppError(403, 'FORBIDDEN', '담당 의사만 기록할 수 있습니다.');
  return current;
}
// VIS-04: 담당 의사의 진행 중 진료를 잠그고 기록·원본 버전·완료 상태/시각을 원자적으로 저장한다.
export async function completeVisit(actor: AccountContext, id: string, input: ClinicalFields) {
  return getPrismaClient().$transaction(async (tx) => {
    await lockAccountStatus(tx);
    const visit = await lockVisit(tx, actor, id);
    if (visit.status === 'COMPLETED')
      throw new AppError(409, 'VISIT_ALREADY_COMPLETED', '이미 완료된 진료입니다.');
    const record = await tx.clinicalRecord.create({
      data: { visitId: id },
      select: { id: true, visitId: true },
    });
    const version = await tx.clinicalRecordVersion.create({
      data: {
        recordId: record.id,
        versionNo: 1,
        ...input,
        correctionReason: null,
        authorAccountId: actor.id,
      },
      select: clinicalVersionSelect,
    });
    const updated = await tx.visit.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
      select: visitSelect,
    });
    return { visit: toVisit(updated), record, version: toClinicalVersion(version) };
  });
}
// VIS-07: 담당 의사의 최신 버전 일치를 잠금 아래 확인한 후 새 버전을 삽입한다. 기존 버전은 유지한다.
export async function correctClinicalRecord(
  actor: AccountContext,
  id: string,
  input: CorrectionFields,
) {
  try {
    return await getPrismaClient().$transaction(async (tx) => {
      await lockAccountStatus(tx);
      const record = await tx.clinicalRecord.findUnique({
        where: { id },
        select: { visitId: true },
      });
      if (!record) throw new AppError(404, 'NOT_FOUND', '진료 기록을 찾을 수 없습니다.');
      await lockVisit(tx, actor, record.visitId);
      const latest = await tx.clinicalRecordVersion.findFirst({
        where: { recordId: id },
        orderBy: { versionNo: 'desc' },
        select: { versionNo: true },
      });
      if (!latest || latest.versionNo !== input.baseVersionNo)
        throw new AppError(409, 'VERSION_CONFLICT', '기록이 변경되어 다시 확인해야 합니다.');
      const version = await tx.clinicalRecordVersion.create({
        data: {
          recordId: id,
          versionNo: latest.versionNo + 1,
          symptoms: input.symptoms,
          diagnosis: input.diagnosis,
          opinion: input.opinion,
          correctionReason: input.correctionReason,
          authorAccountId: actor.id,
        },
        select: clinicalVersionSelect,
      });
      return toClinicalVersion(version);
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
      throw new AppError(409, 'VERSION_CONFLICT', '기록이 변경되어 다시 확인해야 합니다.');
    throw error;
  }
}
