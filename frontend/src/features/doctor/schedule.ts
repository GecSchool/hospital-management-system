import type { DoctorSchedule, WeeklySlot } from './service';
export const minutes = (t: string) =>
  Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export const clock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const weekday = (date: string) =>
  new Date(`${date}T12:00:00+09:00`).getUTCDay();
export { shiftDate } from '../staff/format';
export function normalizedSlots(input: WeeklySlot[]): WeeklySlot[] {
  const sorted = input
    .map((s) => ({ ...s }))
    .sort(
      (a, b) =>
        a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime),
    );
  const out: WeeklySlot[] = [];
  for (const s of sorted) {
    if (
      !Number.isInteger(s.dayOfWeek) ||
      s.dayOfWeek < 0 ||
      s.dayOfWeek > 6 ||
      !/^([01]\d|2[0-3]):(00|20|40)$/.test(s.startTime) ||
      !/^(([01]\d|2[0-3]):(00|20|40)|24:00)$/.test(s.endTime) ||
      s.startTime >= s.endTime
    )
      throw new Error('요일·시작/종료 시각과 20분 경계를 확인해 주세요.');
    const prev = out.at(-1);
    if (prev?.dayOfWeek === s.dayOfWeek) {
      if (prev.endTime > s.startTime)
        throw new Error('같은 요일의 구간이 중복되거나 겹칩니다.');
      if (prev.endTime === s.startTime) {
        prev.endTime = s.endTime;
        continue;
      }
    }
    out.push(s);
  }
  return out;
}
export const includesSlot = (slots: WeeklySlot[], day: number, start: string) =>
  slots.some(
    (s) =>
      s.dayOfWeek === day &&
      minutes(s.startTime) <= minutes(start) &&
      minutes(s.endTime) >= minutes(start) + 20,
  );
/** Merge by resource links, never by patient name or time alone. */
export function scheduleItems(s: DoctorSchedule) {
  const receptions = new Map(s.receptions.map((r) => [r.id, r]));
  const appointments = s.appointments.map((a) => {
    const r =
      (a.receptionId && receptions.get(a.receptionId)) ||
      s.receptions.find((r) => r.appointmentId === a.id);
    return {
      id: a.id,
      appointmentId: a.id,
      receptionId: r?.id,
      visitId: r?.visitId,
      patient: a.patient,
      time: a.startsAt,
      status:
        a.status === 'CANCELLED'
          ? ('CANCELLED' as const)
          : (r?.displayStatus ?? a.displayStatus),
    };
  });
  return [
    ...appointments,
    ...s.receptions
      .filter(
        (r) =>
          !s.appointments.some(
            (a) => a.id === r.appointmentId || a.receptionId === r.id,
          ),
      )
      .map((r) => ({
        id: r.id,
        appointmentId: undefined,
        receptionId: r.id,
        visitId: r.visitId,
        patient: r.patient,
        time: r.receivedAt,
        status: r.displayStatus,
      })),
  ].sort((a, b) => a.time.localeCompare(b.time));
}
