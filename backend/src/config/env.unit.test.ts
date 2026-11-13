import { describe, expect, it } from 'vitest';
import { parseConfig } from './env.js';

describe('서버 설정', () => {
  it('포트 기본값을 적용한다', () => {
    expect(parseConfig({})).toEqual({ port: 3000, corsOrigin: undefined });
  });
  it('유효하지 않은 포트와 와일드카드 CORS를 거부한다', () => {
    for (const port of ['0', '65536', '-1', 'abc']) expect(() => parseConfig({ PORT: port })).toThrow();
    expect(() => parseConfig({ CORS_ORIGIN: '*' })).toThrow();
    expect(() => parseConfig({ CORS_ORIGIN: 'https://example.test/path' })).toThrow();
  });
  it('명시된 포트와 출처를 사용한다', () => {
    expect(parseConfig({ PORT: '4000', CORS_ORIGIN: 'http://localhost:5173' }))
      .toEqual({ port: 4000, corsOrigin: 'http://localhost:5173' });
  });
});
