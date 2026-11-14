import type { AccountContext } from '../../../common/middlewares/auth.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { AppError } from '../../../common/errors/index.js';
import { getPrismaClient } from '../../../config/prisma.js';
import { lockDoctorWork } from '../../medical-staff/services/doctor-work-lock.js';
import { receptionSelect, toReception } from './reception-query.service.js';

/** 삭제 및 다른 호출·입실과 경합하지 않도록 잠금 후 접수와 간호사의 현재 권한을 확인한다. */
async function lockReception(tx: Prisma.TransactionClient, id: string, actor: AccountContext) {
  if (actor.role !== 'NURSE') throw new AppError(403, 'FORBIDDEN', '간호사 권한이 필요합니다.');
  const initial = await tx.reception.findUnique({
    where: { id },
    select: { doctorAccountId: true },
  });
  if (!initial) throw new AppError(404, 'NOT_FOUND', '접수를 찾을 수 없습니다.');
  await lockDoctorWork(tx, initial.doctorAccountId);
  await tx.$queryRaw`SELECT id FROM receptions WHERE id = ${id} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${actor.id} FOR SHARE`;
  await tx.$queryRaw`SELECT account_id FROM nurses WHERE account_id = ${actor.id} FOR SHARE`;
  const nurse = await tx.nurse.findUnique({
    where: { accountId: actor.id },
    select: { departmentId: true, account: { select: { status: true, role: true } } },
  });
  if (!nurse || nurse.account.status !== 'ACTIVE')
    throw new AppError(403, 'ACCOUNT_INACTIVE', '활성 간호사 계정이 아닙니다.');
  if (nurse.account.role !== 'NURSE')
    throw new AppError(403, 'FORBIDDEN', '간호사 권한이 필요합니다.');
  const reception = await tx.reception.findUnique({
    where: { id },
    select: {
      doctorAccountId: true,
      departmentId: true,
      status: true,
      visit: { select: { id: true } },
    },
  });
  if (!reception) throw new AppError(404, 'NOT_FOUND', '접수를 찾을 수 없습니다.');
  if (reception.departmentId !== nurse.departmentId)
    throw new AppError(403, 'FORBIDDEN', '본인 진료과의 접수만 처리할 수 있습니다.');
  return reception;
}
/** 동일 의사에게 진행 중인 진료가 있다면 호출과 입실을 거부한다. */
async function requireDoctorFree(tx: Prisma.TransactionClient, doctorAccountId: string) {
  const busy = await tx.visit.findFirst({
    where: { status: 'IN_PROGRESS', reception: { doctorAccountId } },
    select: { id: true },
  });
  if (busy) throw new AppError(409, 'DOCTOR_BUSY', '담당 의사가 진료 중입니다.');
}
/** REC-05: 같은 과 간호사가 접수를 호출한다. 의사 잠금과 접수 행 잠금 아래 상태·진료 중 여부를
 * 재확인하고 이전 호출을 되돌린 뒤 대상 호출을 원자적으로 저장한다. 같은 의사 진료 중이면 409다. */
export async function callReception(id: string, actor: AccountContext) {
  return getPrismaClient().$transaction(async (tx) => {
    const reception = await lockReception(tx, id, actor);
    await requireDoctorFree(tx, reception.doctorAccountId);
    if (reception.status !== 'REGISTERED' || reception.visit)
      throw new AppError(409, 'CONFLICT', '접수 완료 상태에서만 호출할 수 있습니다.');
    const where = {
      doctorAccountId: reception.doctorAccountId,
      status: 'CALLED' as const,
      visit: { is: null },
    };
    const previous = await tx.reception.findFirst({ where, select: { id: true } });
    if (previous) await tx.reception.updateMany({ where, data: { status: 'REGISTERED' } });
    const changed = await tx.reception.update({
      where: { id },
      data: { status: 'CALLED' },
      select: receptionSelect,
    });
    return {
      reception: toReception(changed, 'NURSE'),
      previousCalledReceptionId: previous?.id ?? null,
    };
  });
}
/** REC-07: 같은 과 간호사가 현재 CALLED 접수의 입실을 확인한다. 의사 잠금과 접수 행 잠금 아래
 * 현재 호출 및 다른 진행 진료를 다시 확인하고 IN_PROGRESS 진료를 생성해 Visit를 반환한다. */
export async function confirmEntry(id: string, actor: AccountContext) {
  return getPrismaClient().$transaction(async (tx) => {
    const reception = await lockReception(tx, id, actor);
    await requireDoctorFree(tx, reception.doctorAccountId);
    if (reception.status !== 'CALLED' || reception.visit)
      throw new AppError(409, 'CONFLICT', '현재 호출된 접수만 입실 확인할 수 있습니다.');
    const visit = await tx.visit.create({
      data: { receptionId: id, status: 'IN_PROGRESS' },
      select: {
        id: true,
        receptionId: true,
        status: true,
        startedAt: true,
        completedAt: true,
        clinicalRecord: { select: { id: true } },
        reception: { select: receptionSelect },
      },
    });
    const formatted = toReception(visit.reception, 'NURSE') as {
      patient: unknown;
      department: unknown;
      doctor: unknown;
    };
    return {
      id: visit.id,
      receptionId: visit.receptionId,
      patient: formatted.patient,
      department: formatted.department,
      doctor: formatted.doctor,
      status: visit.status,
      startedAt: visit.startedAt.toISOString(),
      completedAt: visit.completedAt?.toISOString() ?? null,
      clinicalRecordId: visit.clinicalRecord?.id ?? null,
    };
  });
}
