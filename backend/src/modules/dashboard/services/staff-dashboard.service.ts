import type { AccountContext } from '../../../common/middlewares/auth.js';
import { AppError } from '../../../common/errors/index.js';
import { getPrismaClient } from '../../../config/prisma.js';
import {
  appointmentSelect,
  toAppointment,
} from '../../appointment/services/appointment-query.service.js';
import { receptionSelect, toReception } from '../../reception/services/reception-query.service.js';

// DASH-01: 서울 기준 선택 날짜의 최근 접수 4건과 유효 예약 시간 순 3건을 반환한다.
// 취소 예약은 미리보기에서 제외하며, 전체 목록은 별도 조회한다.
export async function getStaffDashboard(actor: AccountContext, date: string) {
  if (actor.role !== 'STAFF') throw new AppError(403, 'FORBIDDEN', '접근 권한이 없습니다.');
  const start = new Date(`${date}T00:00:00+09:00`);
  const range = { gte: start, lt: new Date(start.getTime() + 86400000) };
  const db = getPrismaClient();
  const receptions = await db.reception.findMany({
    where: { receivedAt: range },
    select: receptionSelect,
    orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    take: 4,
  });
  const appointments = await db.appointment.findMany({
    where: { startsAt: range, status: 'BOOKED' },
    select: appointmentSelect,
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    take: 3,
  });
  return {
    date,
    receptionPreview: receptions.map((row) => toReception(row, actor.role)),
    appointmentPreview: appointments.map((row) => toAppointment(row, actor.role)),
  };
}
