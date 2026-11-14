// 예약·접수 목록에 공통으로 적용하는 화면 상태 규칙.
export type ReceptionDisplayStatus = 'REGISTERED' | 'CALLED' | 'IN_PROGRESS' | 'COMPLETED';
export type AppointmentDisplayStatus = ReceptionDisplayStatus | 'BOOKED' | 'CANCELLED';
type ReceptionStatus = 'REGISTERED' | 'CALLED';
type Visit = { status: 'IN_PROGRESS' | 'COMPLETED' } | null;
/** 진료가 있으면 진료 상태, 없으면 접수 상태를 반환한다. */
export function receptionDisplayStatus(
  status: ReceptionStatus,
  visit: Visit,
): ReceptionDisplayStatus {
  return visit?.status ?? status;
}
/** 취소 예약이 우선하며, 유효 예약은 연결 접수·진료에 따라 표시한다. */
export function appointmentDisplayStatus(
  status: 'BOOKED' | 'CANCELLED',
  reception: { status: ReceptionStatus; visit: Visit } | null,
): AppointmentDisplayStatus {
  if (status === 'CANCELLED') return 'CANCELLED';
  return reception ? receptionDisplayStatus(reception.status, reception.visit) : 'BOOKED';
}
