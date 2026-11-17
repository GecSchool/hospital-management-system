import { describe, expect, it } from 'vitest';
import { formatPhone } from './format';

describe('연락처 표시', () => {
  it('국내 휴대전화와 지역번호를 하이픈으로 구분한다', () => {
    expect(formatPhone('01033334444')).toBe('010-3333-4444');
    expect(formatPhone('0212345678')).toBe('02-1234-5678');
    expect(formatPhone('0311234567')).toBe('031-123-4567');
    expect(formatPhone('010-3333-4444')).toBe('010-3333-4444');
  });
  it('불완전한 입력이나 다른 형식은 임의로 변환하지 않는다', () => {
    expect(formatPhone('01033')).toBe('01033');
    expect(formatPhone('+1-555-123-4567')).toBe('+1-555-123-4567');
  });
});
