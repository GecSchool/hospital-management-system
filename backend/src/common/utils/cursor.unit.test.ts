import { describe, expect, it } from 'vitest';
import { encodeCursor, decodeCursor } from './cursor.js';

describe('기록 이력 커서', () => {
  it('시각과 ID를 복원하고 올바르지 않은 커서를 거부한다', () => {
    const value = { at: '2026-11-09T09:20:00+09:00', id: 'visit_1' };
    expect(decodeCursor(encodeCursor(value))).toEqual(value);
    expect(() => decodeCursor('invalid')).toThrow();
    expect(() => encodeCursor({ at: 'not-a-date', id: '' })).toThrow();
    expect(() => encodeCursor({ at: '2026-02-30T09:20:00+09:00', id: 'visit_1' })).toThrow();
  });
});
