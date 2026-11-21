import { AppError } from '../../../common/errors/index.js';

export function slotUnavailable(): never {
  throw new AppError(409, 'SLOT_UNAVAILABLE', '선택한 시간에 예약할 수 없습니다.');
}

export function rethrowAppointmentWriteError(error: unknown): never {
  // Prisma wraps PostgreSQL check violations from the trigger with the original message.
  const scheduleViolation =
    error instanceof Error && error.message.includes('appointments_schedule_check:');
  const duplicateSlot =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002' &&
    'meta' in error &&
    /appointments_booked_doctor_time_key|doctor_account_id/.test(JSON.stringify(error.meta));

  if (scheduleViolation || duplicateSlot) slotUnavailable();
  throw error;
}
