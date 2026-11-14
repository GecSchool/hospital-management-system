import { describe, expect, it } from 'vitest';
import { parseClinicalVersionNo } from './clinical-record-query.validation.js';
describe('진료 기록 버전 번호', () => {
  it('양의 정수만 허용한다', () => {
    expect(parseClinicalVersionNo('1')).toBe(1);
    for (const value of ['0', '1.5', '-1', 'abc', '99999999999999999', null])
      expect(() => parseClinicalVersionNo(value)).toThrowError(
        expect.objectContaining({ status: 400, code: 'VALIDATION_ERROR' }),
      );
  });
});
