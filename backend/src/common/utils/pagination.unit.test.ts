import { describe, expect, it } from 'vitest';
import { parsePage, paginationMeta } from './pagination.js';

describe('페이지 요청', () => {
  it('기본값과 빈 목록 메타를 계산한다', () => {
    expect(parsePage({})).toEqual({ page: 1, size: 20, skip: 0 });
    expect(paginationMeta(1, 20, 0)).toEqual({ page: 1, size: 20, totalItems: 0, totalPages: 0 });
  });
  it('양의 정수가 아닌 입력을 거부하고 페이지 오프셋을 계산한다', () => {
    expect(parsePage({ page: '3', size: '10' })).toEqual({ page: 3, size: 10, skip: 20 });
    for (const page of ['0', '-1', '1.5', 'abc']) expect(() => parsePage({ page })).toThrow();
  });
});
