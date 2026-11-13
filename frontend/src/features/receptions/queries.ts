import { queryKeys } from '../../services/api/queryKeys';
import type { StaffAppointment } from '../staff/types';
import { businessDate } from '../staff/format';
export const receptionKey = (id: string) =>
  queryKeys.resource(id, 'staff-receptions');
export function receptionEligibility(item: StaffAppointment) {
  return item.status === 'CANCELLED'
    ? '취소된 예약은 접수할 수 없습니다.'
    : item.receptionId || item.displayStatus !== 'BOOKED'
      ? '이미 유효한 접수가 있습니다.'
      : item.startsAt.slice(0, 10) !== businessDate()
        ? '예약일 당일에만 접수할 수 있습니다.'
        : null;
}
