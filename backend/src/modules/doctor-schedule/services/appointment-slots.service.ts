import type { Prisma } from '../../../generated/prisma/client.js';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { AppError } from '../../../common/errors/index.js';
import { businessDate, dayOfWeek, formatTime } from '../../../common/utils/time.js';
import { getPrismaClient } from '../../../config/prisma.js';

type DayData = {
  active: boolean;
  leave: boolean;
  intervals: { startMinute: number; endMinute: number }[];
  occupied: Set<number>;
};
const localMinutes = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return (
    Number(parts.find((p) => p.type === 'hour')?.value) * 60 +
    Number(parts.find((p) => p.type === 'minute')?.value)
  );
};
/** 하루에 필요한 의사·근무·휴진·예약 정보를 조회한다. */
async function loadDay(
  tx: Prisma.TransactionClient,
  doctorId: string,
  date: string,
  excludeAppointmentId?: string,
): Promise<DayData | null> {
  const start = new Date(`${date}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 86400000);
  const doctor = await tx.doctor.findUnique({
    where: { accountId: doctorId },
    select: {
      account: { select: { status: true, role: true } },
      department: { select: { status: true } },
      availability: {
        where: { dayOfWeek: dayOfWeek(start) },
        select: { startMinute: true, endMinute: true },
      },
    },
  });
  if (!doctor) return null;
  const leave = await tx.doctorLeave.findUnique({
    where: {
      doctorAccountId_date: { doctorAccountId: doctorId, date: new Date(`${date}T00:00:00Z`) },
    },
    select: { doctorAccountId: true },
  });
  const occupied = await tx.appointment.findMany({
    where: {
      doctorAccountId: doctorId,
      status: 'BOOKED',
      startsAt: { gte: start, lt: end },
      ...(excludeAppointmentId && { id: { not: excludeAppointmentId } }),
    },
    select: { startsAt: true },
  });
  return {
    active:
      doctor.account.status === 'ACTIVE' &&
      doctor.account.role === 'DOCTOR' &&
      doctor.department.status === 'ACTIVE',
    leave: !!leave,
    intervals: doctor.availability,
    occupied: new Set(occupied.map((x) => x.startsAt.getTime())),
  };
}
function available(day: DayData | null, startsAt: Date, now: Date) {
  if (
    !day ||
    !day.active ||
    day.leave ||
    startsAt.getTime() <= now.getTime() ||
    startsAt.getUTCSeconds() !== 0 ||
    startsAt.getUTCMilliseconds() !== 0
  )
    return false;
  const minute = localMinutes(startsAt);
  return (
    minute % 20 === 0 &&
    day.intervals.some((x) => x.startMinute <= minute && minute + 20 <= x.endMinute) &&
    !day.occupied.has(startsAt.getTime())
  );
}

/** 저장 호출자는 의사 잠금을 확보하고, 미래 20분 경계·계정/진료과 활성·근무·휴진·점유를 검사한다.
 * 예약 대상·권한·제외 ID 유효성은 호출자 책임. 사용할 수 없으면 false를 반환한다. */
export async function isAppointmentSlotAvailable(
  tx: Prisma.TransactionClient,
  doctorId: string,
  startsAt: Date,
  options: { excludeAppointmentId?: string; now?: Date } = {},
): Promise<boolean> {
  if (!Number.isFinite(startsAt.getTime())) return false;
  const day = await loadDay(tx, doctorId, businessDate(startsAt), options.excludeAppointmentId);
  return available(day, startsAt, options.now ?? new Date());
}

/** SCH-05: 직원·같은 과 간호사·본인 의사만 접근. 제외 예약은 직원의 미접수 유효 예약만 허용한다.
 * 날짜 전체 20분 칸의 예약 가능 여부를 반환하며 미정인 reason은 생략한다. */
export async function getAppointmentSlots(
  doctorId: string,
  date: string,
  actor: AccountContext,
  excludeAppointmentId?: string,
) {
  const db = getPrismaClient();
  if (actor.role === 'DOCTOR' && actor.id !== doctorId)
    throw new AppError(403, 'FORBIDDEN', '본인 의사의 예약 시간만 조회할 수 있습니다.');
  if (actor.role === 'ADMIN') throw new AppError(403, 'FORBIDDEN', '접근 권한이 없습니다.');
  const doctor = await db.doctor.findUnique({
    where: { accountId: doctorId },
    select: { departmentId: true },
  });
  if (!doctor) throw new AppError(404, 'NOT_FOUND', '의사를 찾을 수 없습니다.');
  if (actor.role === 'NURSE' && actor.departmentId !== doctor.departmentId)
    throw new AppError(403, 'FORBIDDEN', '본인 진료과의 예약 시간만 조회할 수 있습니다.');
  if (excludeAppointmentId) {
    if (actor.role !== 'STAFF') throw new AppError(403, 'FORBIDDEN', '예약 변경 권한이 없습니다.');
    const appointment = await db.appointment.findUnique({
      where: { id: excludeAppointmentId },
      select: { doctorAccountId: true, status: true, reception: { select: { id: true } } },
    });
    if (!appointment || appointment.doctorAccountId !== doctorId)
      throw new AppError(404, 'NOT_FOUND', '해당 의사의 예약을 찾을 수 없습니다.');
    if (appointment.status !== 'BOOKED')
      throw new AppError(409, 'CONFLICT', '유효한 예약이 아닙니다.');
    if (appointment.reception)
      throw new AppError(
        409,
        'APPOINTMENT_ALREADY_RECEIVED',
        '이미 접수된 예약은 변경할 수 없습니다.',
      );
  }
  const day = await loadDay(db, doctorId, date, excludeAppointmentId);
  const now = new Date();
  const slots = Array.from({ length: 72 }, (_, i) => {
    const startsAt = `${date}T${formatTime(i * 20)}:00+09:00`;
    return { startsAt, available: available(day, new Date(startsAt), now) };
  });
  return { date, intervalMinutes: 20, slots };
}
