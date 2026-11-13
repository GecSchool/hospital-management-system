import { describe, expect, it } from 'vitest';
import { parseAccountQuery } from './account-query.validation.js';

describe('계정 목록 검색 조건', () => {
  it('조건이 없으면 기본 페이지를 사용한다', () => {
    expect(parseAccountQuery({})).toEqual({ page: 1, size: 20, skip: 0 });
  });
  it('이름과 이메일, 역할과 상태를 각각 선택한다', () => {
    expect(
      parseAccountQuery({
        name: ' 김 ',
        email: ' test@ ',
        role: 'DOCTOR',
        status: 'ACTIVE',
        page: '2',
        size: '5',
      }),
    ).toEqual({
      name: '김',
      email: 'test@',
      role: 'DOCTOR',
      status: 'ACTIVE',
      page: 2,
      size: 5,
      skip: 5,
    });
  });
  it('빈 검색 조건은 무시하고 잘못된 값은 거부한다', () => {
    expect(parseAccountQuery({ name: ' ', email: '', role: '', status: '' })).toEqual({
      page: 1,
      size: 20,
      skip: 0,
    });
    for (const query of [
      { role: 'PATIENT' },
      { status: 'UNKNOWN' },
      { page: '0' },
      { name: ['a', 'b'] },
      { size: '2147483648' },
    ]) {
      expect(() => parseAccountQuery(query)).toThrow();
    }
  });
});
