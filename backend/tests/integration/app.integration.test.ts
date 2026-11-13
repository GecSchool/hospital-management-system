import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, createApp } from '../../src/app.js';

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

  it('API에는 보안 헤더를 적용하고 Swagger UI를 정상 제공한다', async () => {
    const health = await request(app).get('/api/health');
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    expect(health.headers['content-security-policy']).toBeTruthy();
    const docs = await request(app).get('/api-docs/');
    expect(docs.status).toBe(200);
    expect(docs.text).toContain('Swagger UI');
    const asset = await request(app).get('/api-docs/swagger-ui-init.js');
    expect(asset.status).toBe(200);
  });

  it('허용된 출처에만 쿠키를 포함한 CORS를 허용한다', async () => {
    const fixture = createApp({ port: 3000, corsOrigin: 'http://localhost:5173' });
    const allowed = await request(fixture).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const denied = await request(fixture).get('/api/health').set('Origin', 'http://other.test');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
