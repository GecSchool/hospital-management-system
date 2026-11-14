import type { AccountContext } from '../../../common/middlewares/auth.js';
import type { parseAppointmentCreate } from '../validations/appointment.validation.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { AppError } from '../../../common/errors/index.js';
import { getPrismaClient } from '../../../config/prisma.js';
import {
  lockAccountStatus,
  lockDoctorWork,
} from '../../medical-staff/services/doctor-work-lock.js';
import { isAppointmentSlotAvailable } from '../../doctor-schedule/services/appointment-slots.service.js';
import { appointmentSelect, toAppointment } from './appointment-query.service.js';
function unavailable(): never {
  throw new AppError(409, 'SLOT_UNAVAILABLE', '선택한 시간에 예약할 수 없습니다.');
}
function duplicate(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002' &&
    'meta' in error &&
    /appointments_booked_doctor_time_key|doctor_account_id/.test(JSON.stringify(error.meta))
  );
}
async function activeActor(
  tx: Prisma.TransactionClient,
  actor: AccountContext,
  allowed: ('STAFF' | 'NURSE')[],
) {
  const row = await tx.account.findUnique({
    where: { id: actor.id },
    select: { status: true, role: true, nurse: { select: { departmentId: true } } },
  });
  if (!row || row.status !== 'ACTIVE')
    throw new AppError(403, 'ACCOUNT_INACTIVE', '비활성 계정입니다.');
  if (row.role !== actor.role || !allowed.some((role) => role === row.role))
    throw new AppError(403, 'FORBIDDEN', '접근 권한이 없습니다.');
  return row;
}
// APT-01: 직원 또는 자기 과 간호사의 등록을 의사 잠금 아래 재검사하고 세션 등록자와 함께 저장한다.
export async function createAppointment(
  actor: AccountContext,
  data: ReturnType<typeof parseAppointmentCreate>,
) {
  const db = getPrismaClient();
  try {
    return await db.$transaction(async (tx) => {
      await lockAccountStatus(tx);
      const requester = await activeActor(tx, actor, ['STAFF', 'NURSE']);
      await lockDoctorWork(tx, data.doctorId);
      const doctor = await tx.doctor.findUnique({
        where: { accountId: data.doctorId },
        select: { departmentId: true },
      });
      if (!doctor) throw new AppError(404, 'NOT_FOUND', '의사를 찾을 수 없습니다.');
      if (requester.role === 'NURSE' && requester.nurse?.departmentId !== data.departmentId)
        throw new AppError(403, 'FORBIDDEN', '본인 진료과에서만 예약할 수 있습니다.');
      if (doctor.departmentId !== data.departmentId) unavailable();
      await tx.$queryRaw`SELECT id FROM "departments" WHERE id = ${data.departmentId} FOR UPDATE`;
      if (!(await tx.patient.findUnique({ where: { id: data.patientId }, select: { id: true } })))
        throw new AppError(404, 'NOT_FOUND', '환자를 찾을 수 없습니다.');
      if (!(await isAppointmentSlotAvailable(tx, data.doctorId, data.startsAt))) unavailable();
      const row = await tx.appointment.create({
        data: {
          patientId: data.patientId,
          departmentId: data.departmentId,
          doctorAccountId: data.doctorId,
          startsAt: data.startsAt,
          registeredByAccountId: actor.id,
        },
        select: appointmentSelect,
      });
      return toAppointment(row, requester.role);
    });
  } catch (error) {
    if (duplicate(error)) unavailable();
    throw error;
  }
}
async function mutableAppointment(tx: Prisma.TransactionClient, id: string) {
  const row = await tx.appointment.findUnique({ where: { id }, select: { doctorAccountId: true } });
  if (!row) throw new AppError(404, 'NOT_FOUND', '예약을 찾을 수 없습니다.');
  await lockDoctorWork(tx, row.doctorAccountId);
  const current = await tx.appointment.findUnique({
    where: { id },
    select: {
      id: true,
      doctorAccountId: true,
      departmentId: true,
      startsAt: true,
      status: true,
      reception: { select: { id: true } },
    },
  });
  if (!current) throw new AppError(404, 'NOT_FOUND', '예약을 찾을 수 없습니다.');
  if (current.status !== 'BOOKED') throw new AppError(409, 'CONFLICT', '유효한 예약이 아닙니다.');
  if (current.reception)
    throw new AppError(409, 'APPOINTMENT_ALREADY_RECEIVED', '이미 접수된 예약입니다.');
  return current;
}
// APT-04: 직원만 접수 전 예약을 같은 의사 잠금 아래 재검사하여 변경한다. 기존 시각은 무변경 반환한다.
export async function changeAppointmentTime(actor: AccountContext, id: string, startsAt: Date) {
  try {
    return await getPrismaClient().$transaction(async (tx) => {
      await lockAccountStatus(tx);
      await activeActor(tx, actor, ['STAFF']);
      const current = await mutableAppointment(tx, id);
      if (current.startsAt.getTime() !== startsAt.getTime()) {
        const doctor = await tx.doctor.findUnique({
          where: { accountId: current.doctorAccountId },
          select: { departmentId: true },
        });
        if (!doctor || doctor.departmentId !== current.departmentId) unavailable();
        await tx.$queryRaw`SELECT id FROM "departments" WHERE id = ${current.departmentId} FOR UPDATE`;
        if (
          !(await isAppointmentSlotAvailable(tx, current.doctorAccountId, startsAt, {
            excludeAppointmentId: id,
          }))
        )
          unavailable();
        await tx.appointment.update({ where: { id }, data: { startsAt } });
      }
      return toAppointment(
        await tx.appointment.findUniqueOrThrow({ where: { id }, select: appointmentSelect }),
        'STAFF',
      );
    });
  } catch (error) {
    if (duplicate(error)) unavailable();
    throw error;
  }
}
// APT-05: 직원만 접수 전 예약을 취소하고 취소자·시각을 보존한다.
export async function cancelAppointment(actor: AccountContext, id: string) {
  return getPrismaClient().$transaction(async (tx) => {
    await lockAccountStatus(tx);
    await activeActor(tx, actor, ['STAFF']);
    await mutableAppointment(tx, id);
    const row = await tx.appointment.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledByAccountId: actor.id, cancelledAt: new Date() },
      select: appointmentSelect,
    });
    return toAppointment(row, 'STAFF');
  });
}
