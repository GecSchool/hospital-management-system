import { describe, expect, it } from 'vitest';
import { parseDoctorsQuery, parseMedicalStaffQuery } from './medical-staff.validation.js';

describe('의료진 조회 입력', () => {
  it('의료진 목록은 역할 없이 첫 페이지를 조회한다', () => {
    expect(parseMedicalStaffQuery({})).toEqual({ page: 1, size: 20, skip: 0 });
    expect(parseMedicalStaffQuery({ role: 'NURSE', page: '2', size: '5' })).toEqual({
      role: 'NURSE',
      page: 2,
      size: 5,
      skip: 5,
    });
    // Role 스키마의 STAFF·ADMIN도 유효하나 의료진 조회 결과는 비어 있다.
    expect(parseMedicalStaffQuery({ role: 'STAFF' }).role).toBe('STAFF');
  });
  it('잘못된 역할이나 페이지는 거부한다', () => {
    for (const query of [
      { role: 'INVALID' },
      { role: ['DOCTOR', 'NURSE'] },
      { page: '0' },
      { size: '2147483648' },
    ]) {
      expect(() => parseMedicalStaffQuery(query)).toThrow();
    }
  });
  it('의사 활성 필터의 참·거짓과 생략을 구분한다', () => {
    expect(parseDoctorsQuery({})).toEqual({});
    expect(parseDoctorsQuery({ activeOnly: 'true' })).toEqual({ activeOnly: true });
    expect(parseDoctorsQuery({ activeOnly: 'false' })).toEqual({ activeOnly: false });
    for (const value of ['', '1', 'yes', ['true', 'false']])
      expect(() => parseDoctorsQuery({ activeOnly: value })).toThrow();
  });
});
