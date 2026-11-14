import type { AccountContext } from '../../../common/middlewares/auth.js';
import { AppError } from '../../../common/errors/index.js';
import { formatTime } from '../../../common/utils/time.js';
import { getPrismaClient } from '../../../config/prisma.js';
import { normalizeSlots } from '../../doctor-schedule/validations/availability.validation.js';
import {
  appointmentSelect,
  toAppointment,
} from '../../appointment/services/appointment-query.service.js';
import { receptionSelect, toReception } from '../../reception/services/reception-query.service.js';
import { visitSelect, toVisit } from '../../visit/services/visit-query.service.js';

/** DASH-02: 본인 일정의 반복 가능 시간, 휴진, 예약 및 접수를 조회한다. */
export async function getDoctorScheduleParts(actor: AccountContext, from: string, to: string) {
  if (actor.role !== 'DOCTOR') throw new AppError(403, 'FORBIDDEN', '의사 권한이 필요합니다.');
  const db = getPrismaClient();
  const doctor = await db.doctor.findUnique({
    where: { accountId: actor.id },
    select: {
      availability: { select: { dayOfWeek: true, startMinute: true, endMinute: true } },
    },
  });
  if (!doctor) throw new AppError(404, 'NOT_FOUND', '의사를 찾을 수 없습니다.');
  const leaves = await db.doctorLeave.findMany({
    where: {
      doctorAccountId: actor.id,
      date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
    },
    orderBy: { date: 'asc' },
  });
  const start = new Date(`${from}T00:00:00+09:00`);
  const end = new Date(new Date(`${to}T00:00:00+09:00`).getTime() + 86400000);
  const appointments = await db.appointment.findMany({
    where: { doctorAccountId: actor.id, startsAt: { gte: start, lt: end } },
    select: appointmentSelect,
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
  });
  const receptions = await db.reception.findMany({
    where: { doctorAccountId: actor.id, receivedAt: { gte: start, lt: end } },
    select: receptionSelect,
    orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
  });
  return {
    from,
    to,
    availability: normalizeSlots(doctor.availability).map((x) => ({
      dayOfWeek: x.dayOfWeek,
      startTime: formatTime(x.startMinute),
      endTime: formatTime(x.endMinute),
    })),
    leaves: leaves.map((x) => ({ date: x.date.toISOString().slice(0, 10) })),
    appointments: appointments.map((x) => toAppointment(x, actor.role)),
    receptions: receptions.map((x) => toReception(x, actor.role)),
  };
}

/** DASH-02 전체 응답: 본인 의사의 반복 시간·휴진과 요청된 서울 날짜 범위의 예약·접수·진료를 반환한다.
 * 예약·접수·진료는 각각 예약 시각·접수 시각·시작 시각으로 판별하며, 진료와 연결된 접수가 범위 밖이어도 진료는 반환한다. */
export async function getDoctorSchedule(actor: AccountContext, from: string, to: string) {
  const parts = await getDoctorScheduleParts(actor, from, to);
  const start = new Date(`${from}T00:00:00+09:00`);
  const end = new Date(new Date(`${to}T00:00:00+09:00`).getTime() + 86400000);
  const visits = await getPrismaClient().visit.findMany({
    where: { startedAt: { gte: start, lt: end }, reception: { doctorAccountId: actor.id } },
    select: visitSelect,
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
  });
  return { ...parts, visits: visits.map(toVisit) };
}
