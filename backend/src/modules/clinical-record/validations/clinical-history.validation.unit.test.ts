import { describe, expect, it } from 'vitest';
import { parseClinicalHistoryQuery } from './clinical-history.validation.js';
import { encodeCursor } from '../../../common/utils/cursor.js';
describe('진료 이력 커서 검증', () => {
  it('기본 limit과 유효한 불투명 커서를 읽는다', () => {
    expect(parseClinicalHistoryQuery({})).toEqual({ limit: 20 });
    const before = encodeCursor({ at: '2026-01-01T00:00:00.000Z', id: 'visit-a' });
    expect(parseClinicalHistoryQuery({ limit: '2', before })).toEqual({
      limit: 2,
      before: { at: '2026-01-01T00:00:00.000Z', id: 'visit-a' },
    });
  });
  it('잘못된 limit과 커서를 거부한다', () => {
    for (const q of [
      { limit: '0' },
      { limit: '-1' },
      { limit: '1.5' },
      { before: 'bad' },
      { limit: ['2'] },
    ])
      expect(() => parseClinicalHistoryQuery(q)).toThrowError(
        expect.objectContaining({ status: 400, code: 'VALIDATION_ERROR' }),
      );
  });
});
