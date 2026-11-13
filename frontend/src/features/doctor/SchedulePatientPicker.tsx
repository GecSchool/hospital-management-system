import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import type { scheduleItems } from './schedule';
import { dateLabel, statusLabels } from '../staff/format';

/** Figma 221:15896: a non-modal patient chooser next to the selected calendar cell. */
export function SchedulePatientPicker({
  items,
  time,
  triggerId,
  returnTo,
  to,
  onClose,
}: {
  items: ReturnType<typeof scheduleItems>;
  time: string;
  triggerId: string;
  returnTo: string;
  to: (item: ReturnType<typeof scheduleItems>[number]) => string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    dialog.current?.focus();
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        !dialog.current?.contains(event.target) &&
        !event.target.closest('[data-doctor-patient-trigger]')
      )
        close.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      document.getElementById(triggerId)?.focus();
    };
  }, [triggerId]);
  return (
    <dialog
      open
      ref={dialog}
      tabIndex={-1}
      aria-label="환자를 선택해 주세요"
      className="doctor-patient-picker"
    >
      <h3>
        {time} · 환자 {items.length}명
      </h3>
      <nav aria-label="같은 시간의 환자">
        {items.map((item) => (
          <Link
            key={item.id}
            to={to(item)}
            state={{ returnTo }}
            onClick={onClose}
          >
            <span>{item.patient.name}</span>
            <span>
              {item.patient.birthDate ? dateLabel(item.patient.birthDate) : '—'}
            </span>
            <span>{statusLabels[item.status]}</span>
          </Link>
        ))}
      </nav>
    </dialog>
  );
}
