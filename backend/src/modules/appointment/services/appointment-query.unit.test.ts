import { describe, expect, it } from 'vitest';
import { appointmentDisplayStatus } from './appointment-query.service.js';
import { parseAppointmentQuery } from '../validations/appointment-query.validation.js';
describe('예약 화면 상태', () => {
  it('취소, 예약, 접수, 호출, 진행, 완료를 실제 상태에 따라 합성한다', () => {
    expect(appointmentDisplayStatus('CANCELLED', null)).toBe('CANCELLED');
    expect(appointmentDisplayStatus('BOOKED', null)).toBe('BOOKED');
    expect(appointmentDisplayStatus('BOOKED', { status: 'REGISTERED', visit: null })).toBe(
      'REGISTERED',
    );
    expect(appointmentDisplayStatus('BOOKED', { status: 'CALLED', visit: null })).toBe('CALLED');
    expect(
      appointmentDisplayStatus('BOOKED', { status: 'CALLED', visit: { status: 'IN_PROGRESS' } }),
    ).toBe('IN_PROGRESS');
    expect(
      appointmentDisplayStatus('BOOKED', { status: 'CALLED', visit: { status: 'COMPLETED' } }),
    ).toBe('COMPLETED');
  });
});

describe('예약 목록 입력', () => {
  it('유효하지 않은 날짜·상태·페이지를 거부한다', () => {
    for (const query of [
      { date: '2030-02-30' },
      { status: 'UNKNOWN' },
      { page: '0' },
      { size: '-1' },
      { patientId: ['x', 'y'] },
    ])
      expect(() => parseAppointmentQuery(query)).toThrow();
  });
});
