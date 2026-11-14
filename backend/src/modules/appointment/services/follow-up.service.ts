import type { AccountContext } from '../../../common/middlewares/auth.js';
import { AppError } from '../../../common/errors/index.js';
import { getPrismaClient } from '../../../config/prisma.js';
import {
  lockAccountStatus,
  lockDoctorWork,
} from '../../medical-staff/services/doctor-work-lock.js';
import { isAppointmentSlotAvailable } from '../../doctor-schedule/services/appointment-slots.service.js';
import { appointmentSelect, toAppointment } from './appointment-query.service.js';
// APT-06: 완료 진료 담당 의사의 재진 예약을 진료의 접수에서 환자·과·의사를 가져와 생성한다.
// 세션 등록자를 기록하고 의사·과 활성, 소속, 근무·휴진·예약 점유를 트랜잭션 안에서 재확인한다.
export async function createFollowUp(actor: AccountContext, visitId: string, startsAt: Date) {
  if (actor.role !== 'DOCTOR') throw new AppError(403, 'FORBIDDEN', '접근 권한이 없습니다.');
  try {
    return await getPrismaClient().$transaction(async (tx) => {
      await lockAccountStatus(tx);
      const visit = await tx.visit.findUnique({
        where: { id: visitId },
        select: {
          status: true,
          reception: { select: { doctorAccountId: true, departmentId: true, patientId: true } },
        },
      });
      if (!visit) throw new AppError(404, 'NOT_FOUND', '진료를 찾을 수 없습니다.');
      if (visit.reception.doctorAccountId !== actor.id)
        throw new AppError(403, 'FORBIDDEN', '담당 진료만 예약할 수 있습니다.');
      await lockDoctorWork(tx, actor.id);
      const account = await tx.account.findUnique({
        where: { id: actor.id },
        select: { role: true, status: true, doctor: { select: { departmentId: true } } },
      });
      if (!account || account.status !== 'ACTIVE')
        throw new AppError(403, 'ACCOUNT_INACTIVE', '비활성 계정입니다.');
      if (account.role !== 'DOCTOR') throw new AppError(403, 'FORBIDDEN', '접근 권한이 없습니다.');
      const current = await tx.visit.findUniqueOrThrow({
        where: { id: visitId },
        select: { status: true },
      });
      if (current.status !== 'COMPLETED')
        throw new AppError(409, 'CONFLICT', '완료된 진료만 예약할 수 있습니다.');
      const { departmentId, patientId } = visit.reception;
      await tx.$queryRaw`SELECT id FROM "departments" WHERE id = ${departmentId} FOR UPDATE`;
      if (
        account.doctor?.departmentId !== departmentId ||
        !(await isAppointmentSlotAvailable(tx, actor.id, startsAt))
      )
        throw new AppError(409, 'SLOT_UNAVAILABLE', '선택한 시간에 예약할 수 없습니다.');
      const row = await tx.appointment.create({
        data: {
          patientId,
          departmentId,
          doctorAccountId: actor.id,
          registeredByAccountId: actor.id,
          startsAt,
        },
        select: appointmentSelect,
      });
      return toAppointment(row, 'DOCTOR');
    });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002' &&
      'meta' in error &&
      /appointments_booked_doctor_time_key|doctor_account_id/.test(JSON.stringify(error.meta))
    )
      throw new AppError(409, 'SLOT_UNAVAILABLE', '선택한 시간에 예약할 수 없습니다.');
    throw error;
  }
}
