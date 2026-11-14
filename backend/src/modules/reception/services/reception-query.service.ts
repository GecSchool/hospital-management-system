import type { Prisma, Role } from '../../../generated/prisma/client.js';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import type { parseReceptionQuery } from '../validations/reception-query.validation.js';
import { AppError } from '../../../common/errors/index.js';
import { paginationMeta } from '../../../common/utils/pagination.js';
import { getPrismaClient } from '../../../config/prisma.js';
import {
  receptionDisplayStatus,
  type ReceptionDisplayStatus,
} from '../../../common/utils/display-status.js';
export { receptionDisplayStatus } from '../../../common/utils/display-status.js';
export type { ReceptionDisplayStatus } from '../../../common/utils/display-status.js';
export const receptionSelect = {
  id: true,
  appointmentId: true,
  receivedAt: true,
  status: true,
  patient: { select: { id: true, patientNumber: true, name: true, birthDate: true, phone: true } },
  doctor: {
    select: {
      accountId: true,
      account: { select: { name: true } },
      department: { select: { id: true, name: true, status: true } },
    },
  },
  department: { select: { id: true, name: true, status: true } },
  visit: { select: { id: true, status: true } },
} satisfies Prisma.ReceptionSelect;
type Row = Prisma.ReceptionGetPayload<{ select: typeof receptionSelect }>;
export function toReception(row: Row, role: Role) {
  const { patient, doctor } = row;
  return {
    id: row.id,
    patient: {
      id: patient.id,
      ...(role === 'STAFF' && { patientNumber: patient.patientNumber }),
      name: patient.name,
      birthDate: patient.birthDate.toISOString().slice(0, 10),
      phone: patient.phone,
    },
    doctor: { id: doctor.accountId, name: doctor.account.name, department: doctor.department },
    department: row.department,
    appointmentId: row.appointmentId,
    receivedAt: row.receivedAt.toISOString(),
    status: row.status,
    displayStatus: receptionDisplayStatus(row.status, row.visit),
    visitId: row.visit?.id ?? null,
    visitStatus: row.visit?.status ?? null,
  };
}
function statusFilter(status: ReceptionDisplayStatus): Prisma.ReceptionWhereInput {
  if (status === 'REGISTERED' || status === 'CALLED') return { status, visit: { is: null } };
  return { visit: { is: { status } } };
}
// REC-02: 날짜 또는 환자 필수, 선택 조건·본인 과 범위·상태 필터 및 페이지 메타를 적용한다.
export async function listReceptions(
  actor: AccountContext,
  query: ReturnType<typeof parseReceptionQuery>,
) {
  if (actor.role !== 'STAFF' && actor.role !== 'NURSE')
    throw new AppError(403, 'FORBIDDEN', '접근 권한이 없습니다.');
  const start = query.date ? new Date(`${query.date}T00:00:00+09:00`) : undefined;
  const where: Prisma.ReceptionWhereInput = {
    AND: [
      ...(actor.role === 'NURSE' ? [{ departmentId: actor.departmentId ?? '' }] : []),
      ...(query.patientId ? [{ patientId: query.patientId }] : []),
      ...(query.departmentId ? [{ departmentId: query.departmentId }] : []),
      ...(query.doctorId ? [{ doctorAccountId: query.doctorId }] : []),
      ...(query.name
        ? [
            {
              patient: {
                name: {
                  contains: query.name.replace(/[\\%_]/g, '\\$&'),
                  mode: 'insensitive' as const,
                },
              },
            },
          ]
        : []),
      ...(query.birthDate
        ? [{ patient: { birthDate: new Date(`${query.birthDate}T00:00:00Z`) } }]
        : []),
      ...(start ? [{ receivedAt: { gte: start, lt: new Date(start.getTime() + 86400000) } }] : []),
      ...(query.status ? [statusFilter(query.status)] : []),
    ],
  };
  const db = getPrismaClient();
  const rows = await db.reception.findMany({
    where,
    select: receptionSelect,
    orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
    skip: query.skip,
    take: query.size,
  });
  const total = await db.reception.count({ where });
  return {
    data: rows.map((row) => toReception(row, actor.role)),
    meta: paginationMeta(query.page, query.size, total),
  };
}
// REC-03: 직원, 본인 과 간호사, 담당 의사만 상세를 조회한다.
export async function getReception(actor: AccountContext, id: string) {
  const row = await getPrismaClient().reception.findUnique({
    where: { id },
    select: receptionSelect,
  });
  if (!row) throw new AppError(404, 'NOT_FOUND', '접수를 찾을 수 없습니다.');
  if (
    (actor.role === 'NURSE' && (!actor.departmentId || actor.departmentId !== row.department.id)) ||
    (actor.role === 'DOCTOR' && actor.id !== row.doctor.accountId) ||
    (actor.role !== 'STAFF' && actor.role !== 'NURSE' && actor.role !== 'DOCTOR')
  )
    throw new AppError(403, 'FORBIDDEN', '접근 권한이 없습니다.');
  return toReception(row, actor.role);
}
