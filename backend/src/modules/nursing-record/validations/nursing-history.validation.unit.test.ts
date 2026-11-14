import { describe, expect, it } from 'vitest';
import { parseNursingHistoryQuery } from './nursing-history.validation.js';
import { encodeCursor } from '../../../common/utils/cursor.js';
describe('간호 이력 조회 검증', () => {
  it('선택 접수·기본 건수·유효 커서를 읽는다', () => {
    expect(parseNursingHistoryQuery({ receptionId: 'r1' })).toEqual({
      receptionId: 'r1',
      limit: 20,
    });
    const before = encodeCursor({ at: '2026-01-01T00:00:00.000Z', id: 'record-a' });
    expect(parseNursingHistoryQuery({ receptionId: 'r1', limit: '2', before })).toEqual({
      receptionId: 'r1',
      limit: 2,
      before: { at: '2026-01-01T00:00:00.000Z', id: 'record-a' },
    });
  });
  it('선택 접수 누락·잘못된 limit·커서를 거부한다', () => {
    for (const q of [
      {},
      { receptionId: '' },
      { receptionId: 'r1', limit: '0' },
      { receptionId: 'r1', before: 'bad' },
    ])
      expect(() => parseNursingHistoryQuery(q)).toThrowError(
        expect.objectContaining({ status: 400, code: 'VALIDATION_ERROR' }),
      );
  });
});
