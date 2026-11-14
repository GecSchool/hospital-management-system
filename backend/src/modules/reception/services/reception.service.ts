import type { AccountContext } from '../../../common/middlewares/auth.js';
import type { ReceptionCreateInput } from '../validations/reception.validation.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { AppError } from '../../../common/errors/index.js';
import { businessDate } from '../../../common/utils/time.js';
import { getPrismaClient } from '../../../config/prisma.js';
import {
  lockAccountStatus,
  lockDoctorWork,
} from '../../medical-staff/services/doctor-work-lock.js';
import { receptionSelect, toReception } from './reception-query.service.js';
async function requireStaff(tx: Prisma.TransactionClient, actor: AccountContext) {
  const account = await tx.account.findUnique({
    where: { id: actor.id },
    select: { role: true, status: true },
  });
  if (!account || account.status !== 'ACTIVE')
    throw new AppError(403, 'ACCOUNT_INACTIVE', '비활성 계정입니다.');
  if (actor.role !== 'STAFF' || account.role !== 'STAFF')
    throw new AppError(403, 'FORBIDDEN', '직원만 접수를 관리할 수 있습니다.');
}
// REC-01: 직원의 예약/현장 접수 요청을 동일 의사 잠금 아래 검사하고 중복 미완료 접수를 거부한다.
export async function createReception(actor: AccountContext, input: ReceptionCreateInput) {
  return getPrismaClient().$transaction(async (tx) => {
    await lockAccountStatus(tx);
    await requireStaff(tx, actor);
    let doctorId: string;
    if ('appointmentId' in input) {
      const appointment = await tx.appointment.findUnique({
        where: { id: input.appointmentId },
        select: { doctorAccountId: true },
      });
      if (!appointment) throw new AppError(404, 'NOT_FOUND', '예약을 찾을 수 없습니다.');
      doctorId = appointment.doctorAccountId;
    } else doctorId = input.doctorId;
    await lockDoctorWork(tx, doctorId);
    const now = new Date(),
      today = businessDate(now),
      start = new Date(`${today}T00:00:00+09:00`),
      end = new Date(start.getTime() + 86400000);
    let patientId: string, departmentId: string, appointmentId: string | undefined;
    if ('appointmentId' in input) {
      const appointment = await tx.appointment.findUnique({
        where: { id: input.appointmentId },
        select: {
          patientId: true,
          departmentId: true,
          doctorAccountId: true,
          startsAt: true,
          status: true,
          reception: { select: { id: true } },
        },
      });
      if (!appointment) throw new AppError(404, 'NOT_FOUND', '예약을 찾을 수 없습니다.');
      if (appointment.status !== 'BOOKED')
        throw new AppError(409, 'CONFLICT', '취소된 예약은 접수할 수 없습니다.');
      if (appointment.startsAt < start || appointment.startsAt >= end)
        throw new AppError(409, 'CONFLICT', '예약 당일에만 접수할 수 있습니다.');
      if (appointment.reception)
        throw new AppError(409, 'DUPLICATE_ACTIVE_RECEPTION', '이미 접수된 예약입니다.');
      ({ patientId, departmentId } = appointment);
      appointmentId = input.appointmentId;
    } else ({ patientId, departmentId } = input);
    const doctor = await tx.doctor.findUnique({
      where: { accountId: doctorId },
      select: { departmentId: true, account: { select: { role: true, status: true } } },
    });
    if (!doctor) throw new AppError(404, 'NOT_FOUND', '의사를 찾을 수 없습니다.');
    if (
      doctor.departmentId !== departmentId ||
      doctor.account.role !== 'DOCTOR' ||
      doctor.account.status !== 'ACTIVE'
    )
      throw new AppError(409, 'CONFLICT', '활성 진료과에 소속된 의사만 접수할 수 있습니다.');
    await tx.$queryRaw`SELECT id FROM "departments" WHERE id = ${departmentId} FOR UPDATE`;
    const department = await tx.department.findUnique({
      where: { id: departmentId },
      select: { status: true },
    });
    if (!department) throw new AppError(404, 'NOT_FOUND', '진료과를 찾을 수 없습니다.');
    if (department.status !== 'ACTIVE')
      throw new AppError(409, 'CONFLICT', '비활성 진료과에는 접수할 수 없습니다.');
    if (!(await tx.patient.findUnique({ where: { id: patientId }, select: { id: true } })))
      throw new AppError(404, 'NOT_FOUND', '환자를 찾을 수 없습니다.');
    const duplicate = await tx.reception.findFirst({
      where: {
        patientId,
        doctorAccountId: doctorId,
        receivedAt: { gte: start, lt: end },
        OR: [{ visit: { is: null } }, { visit: { is: { status: 'IN_PROGRESS' } } }],
      },
      select: { id: true },
    });
    if (duplicate)
      throw new AppError(409, 'DUPLICATE_ACTIVE_RECEPTION', '당일 미완료 접수가 존재합니다.');
    const row = await tx.reception.create({
      data: { patientId, departmentId, doctorAccountId: doctorId, appointmentId, receivedAt: now },
      select: receptionSelect,
    });
    return toReception(row, 'STAFF');
  });
}
// REC-04: 직원은 간호기록·진료가 없는 접수만 의사 및 접수 행 잠금 아래 물리 삭제한다.
export async function deleteReception(actor: AccountContext, id: string): Promise<void> {
  await getPrismaClient().$transaction(async (tx) => {
    await lockAccountStatus(tx);
    await requireStaff(tx, actor);
    const initial = await tx.reception.findUnique({
      where: { id },
      select: { doctorAccountId: true },
    });
    if (!initial) throw new AppError(404, 'NOT_FOUND', '접수를 찾을 수 없습니다.');
    await lockDoctorWork(tx, initial.doctorAccountId);
    await tx.$queryRaw`SELECT id FROM "receptions" WHERE id = ${id} FOR UPDATE`;
    const row = await tx.reception.findUnique({
      where: { id },
      select: {
        visit: { select: { id: true } },
        nursingRecords: { take: 1, select: { id: true } },
      },
    });
    if (!row) throw new AppError(404, 'NOT_FOUND', '접수를 찾을 수 없습니다.');
    if (row.nursingRecords.length)
      throw new AppError(
        409,
        'RECEPTION_HAS_NURSING_RECORDS',
        '간호 기록이 있는 접수는 삭제할 수 없습니다.',
      );
    if (row.visit)
      throw new AppError(409, 'VISIT_ALREADY_STARTED', '진료가 시작된 접수는 삭제할 수 없습니다.');
    await tx.reception.delete({ where: { id } });
  });
}
