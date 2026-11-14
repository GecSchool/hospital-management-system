import type { AccountContext } from '../../../common/middlewares/auth.js';
import type { MinuteSlot } from '../validations/availability.validation.js';
import { normalizeSlots } from '../validations/availability.validation.js';
import { AppError } from '../../../common/errors/index.js';
import { dayOfWeek, formatTime } from '../../../common/utils/time.js';
import { lockDoctorWork } from '../../medical-staff/services/doctor-work-lock.js';
import { getPrismaClient } from '../../../config/prisma.js';

/** DB 분 단위 구간을 API 응답에 맞게 변환한다. */
function response(doctorId: string, slots: MinuteSlot[]) {
  return {
    doctorId,
    intervalMinutes: 20,
    weeklySlots: normalizeSlots(slots).map((x) => ({
      dayOfWeek: x.dayOfWeek,
      startTime: formatTime(x.startMinute),
      endTime: formatTime(x.endMinute),
    })),
  };
}
/** 예약 일시를 서울 시간의 요일·분으로 변환하여 전체 20분 구간이 포함되는지 확인한다. */
function containsBooking(slots: MinuteSlot[], at: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const value = (key: string) => Number(parts.find((p) => p.type === key)?.value);
  const minute =
    value('hour') * 60 + value('minute') + value('second') / 60 + at.getUTCMilliseconds() / 60000;
  return slots.some(
    (s) => s.dayOfWeek === dayOfWeek(at) && s.startMinute <= minute && minute + 20 <= s.endMinute,
  );
}

/** SCH-01: 의사는 본인, 직원은 모든 의사, 간호사는 본인 과 의사만 조회한다.
 * 의사 ID는 계정 ID이며 없으면 404. 결과는 20분 간격과 정렬·병합된 반복 구간이다. */
export async function getAvailability(doctorId: string, actor: AccountContext) {
  if (actor.role === 'DOCTOR' && actor.id !== doctorId)
    throw new AppError(403, 'FORBIDDEN', '본인 시간표만 조회할 수 있습니다.');
  if (actor.role === 'ADMIN') throw new AppError(403, 'FORBIDDEN', '접근 권한이 없습니다.');
  const db = getPrismaClient();
  const doctor = await db.doctor.findUnique({
    where: { accountId: doctorId },
    select: {
      departmentId: true,
      availability: { select: { dayOfWeek: true, startMinute: true, endMinute: true } },
    },
  });
  if (!doctor) throw new AppError(404, 'NOT_FOUND', '의사를 찾을 수 없습니다.');
  if (actor.role === 'NURSE' && actor.departmentId !== doctor.departmentId)
    throw new AppError(403, 'FORBIDDEN', '본인 진료과의 시간표만 조회할 수 있습니다.');
  return response(doctorId, doctor.availability);
}

/** SCH-02: 의사 본인의 전체 주간 시간을 교체한다.
 * 의사별 잠금과 트랜잭션에서 미래 BOOKED 예약 전체가 새 구간 안에 있는지 확인한다.
 * 충돌하면 409 AVAILABILITY_CONFLICT를 반환하며 이전 데이터를 보존한다. */
export async function replaceAvailability(doctorId: string, slots: MinuteSlot[]) {
  const normalized = normalizeSlots(slots);
  return getPrismaClient().$transaction(async (tx) => {
    await lockDoctorWork(tx, doctorId);
    const doctor = await tx.doctor.findUnique({
      where: { accountId: doctorId },
      select: { accountId: true, account: { select: { role: true, status: true } } },
    });
    if (!doctor) throw new AppError(404, 'NOT_FOUND', '의사를 찾을 수 없습니다.');
    if (doctor.account.status !== 'ACTIVE')
      throw new AppError(403, 'ACCOUNT_INACTIVE', '비활성 계정입니다.');
    if (doctor.account.role !== 'DOCTOR')
      throw new AppError(403, 'FORBIDDEN', '의사 권한이 필요합니다.');
    const bookings = await tx.appointment.findMany({
      where: { doctorAccountId: doctorId, status: 'BOOKED', startsAt: { gte: new Date() } },
      select: { startsAt: true },
    });
    if (bookings.some((b) => !containsBooking(normalized, b.startsAt)))
      throw new AppError(409, 'AVAILABILITY_CONFLICT', '기존 예약과 충돌하는 시간표입니다.');
    await tx.doctorAvailability.deleteMany({ where: { doctorAccountId: doctorId } });
    if (normalized.length)
      await tx.doctorAvailability.createMany({
        data: normalized.map((slot) => ({ doctorAccountId: doctorId, ...slot })),
      });
    return response(doctorId, normalized);
  });
}
