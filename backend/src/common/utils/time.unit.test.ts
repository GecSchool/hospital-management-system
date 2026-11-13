import { describe, expect, it } from 'vitest';
import { businessDate, dayOfWeek, parseTime, formatTime, validateDate } from './time.js';

describe('업무 날짜와 시각', () => {
  it('서울 날짜와 요일로 변환한다', () => {
    const instant = new Date('2026-11-15T15:10:00Z');
    expect(businessDate(instant)).toBe('2026-11-16');
    expect(dayOfWeek(instant)).toBe(1);
  });
  it('분 단위로 변환하고 종료 경계의 24:00만 허용한다', () => {
    expect(parseTime('09:20')).toBe(560);
    expect(formatTime(560)).toBe('09:20');
    expect(parseTime('24:00', true)).toBe(1440);
    expect(() => parseTime('24:00')).toThrow();
    expect(() => parseTime('09:19')).toThrow();
    expect(() => parseTime('99:00')).toThrow();
  });
  it('실제 존재하는 날짜만 허용한다', () => {
    expect(validateDate('2024-02-29')).toBe('2024-02-29');
    expect(() => validateDate('2026-02-29')).toThrow();
    expect(() => validateDate('2026-13-01')).toThrow();
  });
});
