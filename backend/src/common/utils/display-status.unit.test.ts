import { describe, expect, it } from 'vitest';
import { appointmentDisplayStatus, receptionDisplayStatus } from './display-status.js';

describe('예약과 접수의 공통 화면 상태', () => {
  it('연결된 예약·접수는 모든 접수·진료 상태에서 동일한 화면 상태를 나타낸다', () => {
    const receptions = [
      { status: 'REGISTERED' as const, visit: null },
      { status: 'CALLED' as const, visit: null },
      { status: 'CALLED' as const, visit: { status: 'IN_PROGRESS' as const } },
      { status: 'CALLED' as const, visit: { status: 'COMPLETED' as const } },
    ];
    for (const reception of receptions)
      expect(appointmentDisplayStatus('BOOKED', reception)).toBe(
        receptionDisplayStatus(reception.status, reception.visit),
      );
    expect(appointmentDisplayStatus('BOOKED', null)).toBe('BOOKED');
    expect(appointmentDisplayStatus('CANCELLED', null)).toBe('CANCELLED');
  });
});
