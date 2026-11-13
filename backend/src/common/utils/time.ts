import { AppError } from '../errors/index.js';

const zone = 'Asia/Seoul';
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: zone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short' });

export function validateDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new AppError(400, 'VALIDATION_ERROR', '날짜 형식이 올바르지 않습니다.');
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year === 0 || month < 1 || month > 12 || day < 1 || day > days[month - 1])
    throw new AppError(400, 'VALIDATION_ERROR', '존재하지 않는 날짜입니다.');
  return value;
}

export function businessDate(date: Date): string {
  const parts = dateFormatter.formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function dayOfWeek(date: Date): number {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayFormatter.format(date));
}

export function parseTime(value: string, allowEndOfDay = false): number {
  if (!/^\d{2}:\d{2}$/.test(value))
    throw new AppError(400, 'VALIDATION_ERROR', '시각 형식이 올바르지 않습니다.');
  const [hour, minute] = value.split(':').map(Number);
  if (hour === 24 && minute === 0 && allowEndOfDay) return 1440;
  if (hour > 23 || minute > 59 || minute % 20 !== 0)
    throw new AppError(400, 'VALIDATION_ERROR', '시각은 20분 단위여야 합니다.');
  return hour * 60 + minute;
}

export function formatTime(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440 || minutes % 20 !== 0)
    throw new AppError(400, 'VALIDATION_ERROR', '시각 값이 올바르지 않습니다.');
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
