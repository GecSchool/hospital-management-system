import type { AccountContext } from '../../../common/middlewares/auth.js';
import { AppError } from '../../../common/errors/index.js';
import { getPrismaClient } from '../../../config/prisma.js';
import { lockDoctorWork } from '../../medical-staff/services/doctor-work-lock.js';
import { parseLeaveRequest } from '../validations/leave.validation.js';
// SCH-03: 의사 본인, 직원, 본인 과 간호사만 대상 의사의 범위 내 휴진일을 날짜순 조회한다.
export async function listLeaves(
  actor: AccountContext,
  doctorId: string,
  from: string,
  to: string,
): Promise<{ date: string }[]> {
  const db = getPrismaClient();
  const doctor = await db.doctor.findUnique({
    where: { accountId: doctorId },
    select: { departmentId: true },
  });
  if (!doctor) throw new AppError(404, 'NOT_FOUND', '의사를 찾을 수 없습니다.');
  if (!(
    actor.role === 'STAFF' ||
    (actor.role === 'DOCTOR' && actor.id === doctorId) ||
    (actor.role === 'NURSE' && actor.departmentId === doctor.departmentId)
  ))
    throw new AppError(403, 'FORBIDDEN', '휴진 목록 접근 권한이 없습니다.');
  const rows = await db.doctorLeave.findMany({
    where: {
      doctorAccountId: doctorId,
      date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
    },
    select: { date: true },
    orderBy: { date: 'asc' },
  });
  return rows.map((row) => ({ date: row.date.toISOString().slice(0, 10) }));
}
// SCH-04: 동일 의사 잠금과 트랜잭션에서 서울 업무 날짜의 유효 예약을 검사하고 휴진을 생성한다. 중복/예약은 409다.
export async function createLeave(actor: AccountContext, date: string): Promise<{ date: string }> {
  if (actor.role !== 'DOCTOR')
    throw new AppError(403, 'FORBIDDEN', '의사만 휴진을 신청할 수 있습니다.');
  const db = getPrismaClient();
  try {
    return await db.$transaction(async (tx) => {
      await lockDoctorWork(tx, actor.id);
      parseLeaveRequest({ date });
      const doctor = await tx.doctor.findUnique({
        where: { accountId: actor.id },
        select: { account: { select: { role: true, status: true } } },
      });
      if (!doctor) throw new AppError(404, 'NOT_FOUND', '의사를 찾을 수 없습니다.');
      if (doctor.account.role !== 'DOCTOR' || doctor.account.status !== 'ACTIVE')
        throw new AppError(403, 'FORBIDDEN', '활성 의사만 휴진을 신청할 수 있습니다.');
      const leaveDate = new Date(`${date}T00:00:00Z`);
      const existing = await tx.doctorLeave.findUnique({
        where: { doctorAccountId_date: { doctorAccountId: actor.id, date: leaveDate } },
      });
      if (existing) throw new AppError(409, 'CONFLICT', '이미 등록된 휴진일입니다.');
      const start = new Date(`${date}T00:00:00+09:00`);
      const end = new Date(start.getTime() + 86400000);
      const booked = await tx.appointment.findFirst({
        where: { doctorAccountId: actor.id, status: 'BOOKED', startsAt: { gte: start, lt: end } },
        select: { id: true },
      });
      if (booked)
        throw new AppError(409, 'LEAVE_HAS_BOOKING', '예약이 있는 날짜는 휴진할 수 없습니다.');
      await tx.doctorLeave.create({ data: { doctorAccountId: actor.id, date: leaveDate } });
      return { date };
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
      throw new AppError(409, 'CONFLICT', '이미 등록된 휴진일입니다.');
    throw error;
  }
}
