import type { DisplayStatus } from './types';
/** Format familiar domestic numbers for display without altering stored data. */
export function formatPhone(value: string): string {
  if (!/^[\d-]+$/.test(value)) return value;
  const digits = value.replaceAll('-', '');
  if (/^02\d{7,8}$/.test(digits))
    return `${digits.slice(0, 2)}-${digits.slice(2, -4)}-${digits.slice(-4)}`;
  if (/^0\d{9,10}$/.test(digits))
    return `${digits.slice(0, 3)}-${digits.slice(3, -4)}-${digits.slice(-4)}`;
  return value;
}
export const statusLabels: Record<DisplayStatus, string> = {
  BOOKED: '예약',
  CANCELLED: '취소',
  REGISTERED: '접수 완료',
  CALLED: '호출됨',
  IN_PROGRESS: '진료 중',
  COMPLETED: '진료 완료',
};
export function businessDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export const dateLabel = (date: string) => date.replaceAll('-', '.');
/** Convert a timestamp to its Seoul calendar date; date-only values stay unchanged. */
export function seoulDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Shift a Seoul business date using the existing noon/UTC arithmetic. */
export function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function dateTimeLabel(value: string, timeOnly = false) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  const time = `${part('hour')}:${part('minute')}`;
  return timeOnly
    ? time
    : `${part('year')}.${part('month')}.${part('day')}  ${time}`;
}
export function longDateLabel(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date(`${value}T12:00:00+09:00`));
}
