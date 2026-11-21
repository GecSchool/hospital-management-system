import { includesSlot, weekday } from '../doctor/schedule';
import { slotReason } from './queries';
import type { AppointmentSlots, Availability } from './service';

const defaultStart = '09:00';
const defaultEnd = '18:00';
const slotTime = (startsAt: string) => startsAt.slice(11, 16);

export function visibleAppointmentSlots(
  result: AppointmentSlots | undefined,
  weeklySlots: Availability['weeklySlots'] = [],
) {
  if (!result) return [];
  const day = weekday(result.date);
  return result.slots
    .filter(({ startsAt }) => {
      const time = slotTime(startsAt);
      return (
        (time >= defaultStart && time < defaultEnd) ||
        includesSlot(weeklySlots, day, time)
      );
    })
    .sort((a, b) => slotTime(a.startsAt).localeCompare(slotTime(b.startsAt)));
}

export function sameAppointmentTime(a: string, b: string) {
  return Date.parse(a) === Date.parse(b);
}

export function AppointmentSlotGrid({
  slots,
  value,
  onSelect,
  disabled,
  label,
}: {
  slots: AppointmentSlots['slots'];
  value: string;
  onSelect: (time: string) => void;
  disabled: boolean;
  label: string;
}) {
  if (!slots.length) return <p>예약 가능한 시간대가 없습니다.</p>;
  return (
    <div className="appointment-slot-grid" role="group" aria-label={label}>
      {slots.map(({ startsAt, available, reason }) => {
        const time = slotTime(startsAt);
        return (
          <button
            type="button"
            key={startsAt}
            aria-pressed={sameAppointmentTime(startsAt, value)}
            aria-label={available ? time : `${time} · ${slotReason(reason)}`}
            title={available ? '예약 가능' : slotReason(reason)}
            disabled={!available || disabled}
            onClick={() => onSelect(startsAt)}
          >
            {time}
          </button>
        );
      })}
    </div>
  );
}
