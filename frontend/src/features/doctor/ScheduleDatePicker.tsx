import { useEffect, useId, useRef, useState, type FocusEvent } from 'react';
import { businessDate, longDateLabel } from '../staff/format';
import { shiftDate, weekday } from './schedule';

const days = ['일', '월', '화', '수', '목', '금', '토'];
const dateKey = (year: number, month: number, day: number) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export function ScheduleDatePicker({
  date,
  onChange,
}: {
  date: string;
  onChange: (date: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'day' | 'month' | 'year' | null>(null);
  const [year, setYear] = useState(0);
  const [month, setMonth] = useState(0);
  const first = dateKey(year, month, 1);
  const nextMonth =
    month === 12 ? dateKey(year + 1, 1, 1) : dateKey(year, month + 1, 1);
  const lastDay =
    view === 'day' ? Number(shiftDate(nextMonth, -1).slice(8)) : 0;
  useEffect(() => {
    if (view) popup.current?.focus();
  }, [view]);
  const close = () => {
    setView(null);
    trigger.current?.focus();
  };
  function move(direction: number) {
    if (view === 'year') setYear((value) => value + direction * 12);
    if (view === 'month') setYear((value) => value + direction);
    if (view === 'day') {
      const [targetYear, targetMonth] = (
        direction < 0 ? shiftDate(first, -1) : nextMonth
      )
        .split('-')
        .map(Number);
      setYear(targetYear);
      setMonth(targetMonth);
    }
  }
  function dismiss(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setView(null);
  }

  return (
    <div
      className="schedule-date-picker"
      onBlur={dismiss}
      onKeyDown={(event) => {
        if (view && event.key === 'Escape') {
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        className="schedule-date-trigger doctor-date-label"
        type="button"
        aria-expanded={!!view}
        aria-controls={view ? id : undefined}
        aria-label={`선택 날짜 ${longDateLabel(date)}`}
        onClick={() => {
          if (view) return close();
          const [selectedYear, selectedMonth] = date.split('-').map(Number);
          setYear(selectedYear);
          setMonth(selectedMonth);
          setView('day');
        }}
      >
        {longDateLabel(date)}
      </button>
      {view && (
        <div
          ref={popup}
          id={id}
          role="group"
          aria-label="달력"
          tabIndex={-1}
          className="schedule-calendar"
        >
          <div className="schedule-calendar-header">
            <button
              type="button"
              aria-label="달력 이전 범위"
              onClick={() => move(-1)}
            >
              ‹
            </button>
            <span>
              <button type="button" onClick={() => setView('year')}>
                {year}년
              </button>
              {view === 'day' && (
                <button type="button" onClick={() => setView('month')}>
                  {month}월
                </button>
              )}
            </span>
            <button
              type="button"
              aria-label="달력 다음 범위"
              onClick={() => move(1)}
            >
              ›
            </button>
          </div>
          {view === 'day' ? (
            <div className="schedule-calendar-days">
              {days.map((day) => (
                <span key={day}>{day}</span>
              ))}
              {Array.from({ length: weekday(first) }, (_, index) => (
                <span key={`blank-${index}`} aria-hidden="true" />
              ))}
              {Array.from({ length: lastDay }, (_, index) => {
                const day = index + 1;
                const value = dateKey(year, month, day);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-label={longDateLabel(value)}
                    aria-pressed={value === date}
                    aria-current={value === businessDate() ? 'date' : undefined}
                    onClick={() => {
                      close();
                      onChange(value);
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="schedule-calendar-months">
              {Array.from({ length: 12 }, (_, index) => {
                const value = view === 'year' ? year - 5 + index : index + 1;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={value === (view === 'year' ? year : month)}
                    onClick={() => {
                      if (view === 'year') {
                        setYear(value);
                        setView('month');
                      } else {
                        setMonth(value);
                        setView('day');
                      }
                    }}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
