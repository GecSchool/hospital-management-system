import { describe, expect, it } from 'vitest';
import { parseWeeklySlots } from './availability.validation.js';

describe('주간 진료 가능 시간 검증', () => {
  it('요일·시각 순으로 정렬하고 맞닿은 구간을 합친다', () => {
    expect(
      parseWeeklySlots({
        weeklySlots: [
          { dayOfWeek: 1, startTime: '10:00', endTime: '12:00' },
          { dayOfWeek: 0, startTime: '23:40', endTime: '24:00' },
          { dayOfWeek: 1, startTime: '09:00', endTime: '10:00' },
        ],
      }),
    ).toEqual([
      { dayOfWeek: 0, startMinute: 1420, endMinute: 1440 },
      { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
    ]);
    expect(parseWeeklySlots({ weeklySlots: [] })).toEqual([]);
  });
  it('요일·경계·역전·겹침 및 중복을 거부한다', () => {
    const slot = (dayOfWeek: unknown, startTime: unknown, endTime: unknown) => ({
      dayOfWeek,
      startTime,
      endTime,
    });
    for (const weeklySlots of [
      [slot(7, '09:00', '10:00')],
      [slot('1', '09:00', '10:00')],
      [slot(1, '09:10', '10:00')],
      [slot(1, '24:00', '24:00')],
      [slot(1, '10:00', '09:00')],
      [slot(1, '09:00', '09:00')],
      [slot(1, '09:00', '10:00'), slot(1, '09:40', '10:20')],
      [slot(1, '09:00', '10:00'), slot(1, '09:00', '10:00')],
    ])
      expect(() => parseWeeklySlots({ weeklySlots })).toThrowError(
        expect.objectContaining({ status: 400, code: 'VALIDATION_ERROR' }),
      );
    for (const body of [{}, null, { weeklySlots: 'x' }])
      expect(() => parseWeeklySlots(body)).toThrowError(expect.objectContaining({ status: 400 }));
  });
});
