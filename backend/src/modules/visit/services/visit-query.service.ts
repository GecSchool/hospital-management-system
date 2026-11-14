import type { Prisma } from '../../../generated/prisma/client.js';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { AppError } from '../../../common/errors/index.js';
import { getPrismaClient } from '../../../config/prisma.js';
// VIS-02: 진료는 접수에서 담당 의사·환자·당시 진료과를 확인한다.
export const visitSelect = {
  id: true,
  receptionId: true,
  status: true,
  startedAt: true,
  completedAt: true,
  clinicalRecord: { select: { id: true } },
  reception: {
    select: {
      patient: { select: { id: true, name: true, birthDate: true, phone: true } },
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
} satisfies Prisma.VisitSelect;
type Row = Prisma.VisitGetPayload<{ select: typeof visitSelect }>;
// 필요한 요약 필드만 반환하고 주민등록번호·환자번호 및 기록 본문은 제공하지 않는다.
export function toVisit(row: Row) {
  const { patient, doctor, department } = row.reception;
  return {
    id: row.id,
    receptionId: row.receptionId,
    patient: {
      id: patient.id,
      name: patient.name,
      birthDate: patient.birthDate.toISOString().slice(0, 10),
      phone: patient.phone,
    },
    department,
    doctor: { id: doctor.accountId, name: doctor.account.name, department: doctor.department },
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    clinicalRecordId: row.clinicalRecord?.id ?? null,
  };
}
// 담당 의사만 진료 상세를 조회한다.
export async function getVisit(actor: AccountContext, id: string) {
  if (actor.role !== 'DOCTOR') throw new AppError(403, 'FORBIDDEN', '의사 권한이 필요합니다.');
  const row = await getPrismaClient().visit.findUnique({ where: { id }, select: visitSelect });
  if (!row) throw new AppError(404, 'NOT_FOUND', '진료를 찾을 수 없습니다.');
  if (row.reception.doctor.accountId !== actor.id)
    throw new AppError(403, 'FORBIDDEN', '담당 진료만 조회할 수 있습니다.');
  return toVisit(row);
}
