import { describe, expect, it } from 'vitest';
import { receptionDisplayStatus } from './reception-query.service.js';
import { parseReceptionQuery } from '../validations/reception-query.validation.js';
describe('접수 상태 및 검색 조건', () => {
  it('진료 상태가 호출·접수 상태보다 우선한다', () => {
    expect(receptionDisplayStatus('REGISTERED', null)).toBe('REGISTERED');
    expect(receptionDisplayStatus('CALLED', null)).toBe('CALLED');
    expect(receptionDisplayStatus('CALLED', { status: 'IN_PROGRESS' })).toBe('IN_PROGRESS');
    expect(receptionDisplayStatus('CALLED', { status: 'COMPLETED' })).toBe('COMPLETED');
  });
  it('날짜 또는 환자 ID가 필수이고 상태와 날짜가 올바라야 한다', () => {
    for (const q of [
      {},
      { date: '', patientId: '' },
      { date: '2030-02-30' },
      { patientId: 'p', status: 'BOOKED' },
      { patientId: 'p', page: '0' },
    ])
      expect(() => parseReceptionQuery(q)).toThrow();
    expect(parseReceptionQuery({ patientId: 'p' }).patientId).toBe('p');
  });
});
