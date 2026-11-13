import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';

describe('HTTP 서버 준비 상태', () => {
  it('헬스 체크에 성공 응답을 반환한다', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('Swagger UI가 참조하는 OpenAPI 문서를 제공한다', async () => {
    const response = await request(app).get('/api-docs/openapi.yaml');
    expect(response.status).toBe(200);
    expect(response.text).toContain('openapi:');
  });
});
