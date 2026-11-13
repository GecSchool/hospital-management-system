import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../services/api/queryKeys';
import { getSessionGeneration } from '../../services/api/sessionGeneration';
import { ApiError } from '../../services/api/errors';
import { useAuth } from '../auth/useAuth';
import { staffKeys } from '../staff/queries';
export const bookingKey = (id: string) =>
  queryKeys.resource(id, 'staff-appointments');
export function bookingError(error: unknown) {
  return error instanceof ApiError
    ? ({
        AVAILABILITY_CONFLICT:
          '미래 예약과 충돌하여 저장하지 않았습니다. 입력 내용은 유지됩니다.',
        LEAVE_HAS_BOOKING: '예약이 있는 날짜는 휴진할 수 없습니다.',
        VISIT_ALREADY_COMPLETED:
          '이미 완료된 진료입니다. 기존 기록은 변경하지 않았습니다.',
        DOCTOR_BUSY: '담당 의사가 진료 중입니다. 잠시 후 다시 확인해 주세요.',
        SLOT_UNAVAILABLE:
          '선택한 시간은 더 이상 예약할 수 없습니다. 시간을 다시 선택해 주세요.',
        APPOINTMENT_ALREADY_RECEIVED:
          '이미 접수된 예약은 변경하거나 취소할 수 없습니다.',
        APPOINTMENT_CANCELLED: '이미 취소된 예약입니다.',
        DUPLICATE_ACTIVE_RECEPTION:
          '같은 환자·의사의 미완료 접수가 이미 있거나 이미 접수된 예약입니다.',
        RECEPTION_HAS_NURSING_RECORDS:
          '간호 기록이 작성된 접수는 삭제할 수 없습니다.',
        VISIT_ALREADY_STARTED: '진료가 시작된 접수는 삭제할 수 없습니다.',
        APPOINTMENT_DATE_MISMATCH: '예약일 당일에만 접수할 수 있습니다.',
      }[error.code] ?? error.message)
    : '처리에 실패했습니다. 다시 시도해 주세요.';
}
export function useBookingWrite() {
  const { user } = useAuth();
  const client = useQueryClient();
  const active = useRef(false);
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function run(write: () => Promise<unknown>, done: () => void) {
    if (lock.current || !user) return;
    lock.current = true;
    setPending(true);
    setError('');
    const generation = getSessionGeneration();
    const current = () =>
      active.current && generation === getSessionGeneration();
    try {
      await write();
      if (!current()) return;
      const keys = [
        queryKeys.resource(user.id, 'doctor-clinical'),
        queryKeys.resource(user.id, 'doctor-schedule'),
        queryKeys.resource(user.id, 'nurse-receptions'),
        bookingKey(user.id),
        queryKeys.resource(user.id, 'staff-receptions'),
        staffKeys.patients(user.id),
        staffKeys.dashboard(user.id),
      ];
      await Promise.all(
        keys.map((queryKey) => client.cancelQueries({ queryKey })),
      );
      if (!current()) return;
      await Promise.all(
        keys.map((queryKey) => client.invalidateQueries({ queryKey })),
      );
      if (current()) done();
    } catch (e) {
      if (current()) {
        setError(bookingError(e));
        await Promise.all(
          [
            queryKeys.resource(user.id, 'nurse-receptions'),
            bookingKey(user.id),
            queryKeys.resource(user.id, 'staff-receptions'),
          ].map((queryKey) => client.invalidateQueries({ queryKey })),
        );
      }
    } finally {
      lock.current = false;
      if (current()) setPending(false);
    }
  }
  return { run, pending, error };
}
export function slotReason(reason?: string | null) {
  return (
    {
      ALREADY_BOOKED: '이미 예약됨',
      OUTSIDE_WORKING_HOURS: '진료 가능 시간 외',
      DAY_OFF: '휴진',
      LEAVE: '휴진',
      PAST_TIME: '지난 시간',
    }[reason ?? ''] ?? '예약 불가'
  );
}
