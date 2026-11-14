import type { AccountContext } from '../../../common/middlewares/auth.js';
import type { parseAppointmentQuery } from '../validations/appointment-query.validation.js';
import type { Prisma, Role } from '../../../generated/prisma/client.js';
import { AppError } from '../../../common/errors/index.js';
import { paginationMeta } from '../../../common/utils/pagination.js';
import { getPrismaClient } from '../../../config/prisma.js';
import { accountSummarySelect, toAccountSummary } from '../../account/services/account-summary.js';
export type AppointmentDisplayStatus =
  'BOOKED' | 'CANCELLED' | 'REGISTERED' | 'CALLED' | 'IN_PROGRESS' | 'COMPLETED';
// 취소 > 진료 > 호출/접수 > 예약 순으로 화면 상태를 합성한다.
export function appointmentDisplayStatus(
  status: 'BOOKED' | 'CANCELLED',
  reception: {
    status: 'REGISTERED' | 'CALLED';
    visit: { status: 'IN_PROGRESS' | 'COMPLETED' } | null;
  } | null,
): AppointmentDisplayStatus {
  if (status === 'CANCELLED') return 'CANCELLED';
  if (!reception) return 'BOOKED';
  return reception.visit?.status ?? reception.status;
}
export const appointmentSelect = {
  id: true,
  startsAt: true,
  status: true,
  cancelledAt: true,
  patient: { select: { id: true, patientNumber: true, name: true, birthDate: true, phone: true } },
  doctor: {
    select: {
      accountId: true,
      account: { select: { name: true } },
      department: { select: { id: true, name: true, status: true } },
    },
  },
  department: { select: { id: true, name: true, status: true } },
  registeredBy: { select: accountSummarySelect },
  reception: { select: { id: true, status: true, visit: { select: { status: true } } } },
} satisfies Prisma.AppointmentSelect;
type AppointmentRow = Prisma.AppointmentGetPayload<{ select: typeof appointmentSelect }>;
export function toAppointment(row: AppointmentRow, role: Role) {
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
    startsAt: row.startsAt.toISOString(),
    status: row.status,
    displayStatus: appointmentDisplayStatus(row.status, row.reception),
    registeredBy: toAccountSummary(row.registeredBy),
    receptionId: row.reception?.id ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
  };
}
function statusFilter(status: AppointmentDisplayStatus): Prisma.AppointmentWhereInput {
  switch (status) {
    case 'CANCELLED':
      return { status: 'CANCELLED' };
    case 'BOOKED':
      return { status: 'BOOKED', reception: { is: null } };
    case 'REGISTERED':
      return { status: 'BOOKED', reception: { is: { status: 'REGISTERED', visit: { is: null } } } };
    case 'CALLED':
      return { status: 'BOOKED', reception: { is: { status: 'CALLED', visit: { is: null } } } };
    case 'IN_PROGRESS':
    case 'COMPLETED':
      return { status: 'BOOKED', reception: { is: { visit: { is: { status } } } } };
  }
}
// APT-02: 검색과 화면 상태 필터, 간호사 소속 범위, 페이지 메타를 일치시킨다.
export async function listAppointments(
  actor: AccountContext,
  query: ReturnType<typeof parseAppointmentQuery>,
) {
  if (actor.role !== 'STAFF' && actor.role !== 'NURSE')
    throw new AppError(403, 'FORBIDDEN', '접근 권한이 없습니다.');
  const dateStart = query.date ? new Date(`${query.date}T00:00:00+09:00`) : undefined;
  const where: Prisma.AppointmentWhereInput = {
    AND: [
      ...(actor.role === 'NURSE' ? [{ departmentId: actor.departmentId ?? '' }] : []),
      ...(query.patientId ? [{ patientId: query.patientId }] : []),
      ...(query.patientName
        ? [
            {
              patient: {
                name: {
                  contains: query.patientName.replace(/[\\%_]/g, '\\$&'),
                  mode: 'insensitive' as const,
                },
              },
            },
          ]
        : []),
      ...(query.departmentId ? [{ departmentId: query.departmentId }] : []),
      ...(query.doctorId ? [{ doctorAccountId: query.doctorId }] : []),
      ...(dateStart
        ? [{ startsAt: { gte: dateStart, lt: new Date(dateStart.getTime() + 86400000) } }]
        : []),
      ...(query.status ? [statusFilter(query.status)] : []),
    ],
  };
  const db = getPrismaClient();
  const rows = await db.appointment.findMany({
    where,
    select: appointmentSelect,
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    skip: query.skip,
    take: query.size,
  });
  const total = await db.appointment.count({ where });
  return {
    data: rows.map((row) => toAppointment(row, actor.role)),
    meta: paginationMeta(query.page, query.size, total),
  };
}
// APT-03: 직원 전체, 간호사 본인 과, 의사 본인 예약만 상세를 반환한다.
export async function getAppointment(actor: AccountContext, id: string) {
  const db = getPrismaClient();
  const row = await db.appointment.findUnique({ where: { id }, select: appointmentSelect });
  if (!row) throw new AppError(404, 'NOT_FOUND', '예약을 찾을 수 없습니다.');
  if (
    (actor.role === 'NURSE' && (!actor.departmentId || actor.departmentId !== row.department.id)) ||
    (actor.role === 'DOCTOR' && actor.id !== row.doctor.accountId) ||
    (actor.role !== 'STAFF' && actor.role !== 'NURSE' && actor.role !== 'DOCTOR')
  )
    throw new AppError(403, 'FORBIDDEN', '접근 권한이 없습니다.');
  return toAppointment(row, actor.role);
}
