import { parseLeaveRange } from '../../doctor-schedule/validations/leave.validation.js';

/** DASH-02: 시작일과 종료일은 필수 날짜이며 시작일은 종료일 이하여야 한다. */
export function parseDoctorScheduleQuery(query: Record<string, unknown>) {
  return parseLeaveRange(query);
}
