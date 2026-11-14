import { describe, expect, it } from 'vitest';
import { parseSlotQuery } from './appointment-slots.validation.js';
describe('예약 시간 조회 조건', () => {
  it('날짜와 선택적 제외 예약 ID를 읽는다', () => {
    expect(parseSlotQuery({ date: '2030-01-06', excludeAppointmentId: 'apt_1' })).toEqual({
      date: '2030-01-06',
      excludeAppointmentId: 'apt_1',
    });
  });
  it('날짜·제외 예약이 잘못되면 거부한다', () => {
    for (const input of [
      {},
      { date: '2030-02-30' },
      { date: '2030-01-06', excludeAppointmentId: '' },
      { date: ['2030-01-06'] },
    ])
      expect(() => parseSlotQuery(input)).toThrowError(
        expect.objectContaining({ status: 400, code: 'VALIDATION_ERROR' }),
      );
  });
});
