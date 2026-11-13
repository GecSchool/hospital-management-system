import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { businessDate, dateTimeLabel } from '../staff/format';
import { minutes } from './schedule';

/** One minute timer isolated from schedule fetching/rendering. Position is relative to the actual slot row. */
export function CurrentTime({
  date,
  table,
}: {
  date: string;
  table: RefObject<HTMLTableElement | null>;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const interval = window.setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', update);
    };
  }, [date]);
  const time = dateTimeLabel(now.toISOString(), true);
  const minute = minutes(time);
  const slot = Math.floor(minute / 20) * 20;
  const [cell, setCell] = useState<Element | null>(null);
  useLayoutEffect(() => {
    setCell(
      date === businessDate()
        ? (table.current?.querySelector(`[data-slot-start="${slot}"]`) ?? null)
        : null,
    );
  }, [date, slot, table, now]);
  return cell
    ? createPortal(
        <span
          className="doctor-now"
          role="img"
          aria-label={`현재 시각 ${time}`}
          style={{ top: `${((minute - slot) / 20) * 100}%` }}
        >
          <span>{time}</span>
        </span>,
        cell,
      )
    : null;
}
