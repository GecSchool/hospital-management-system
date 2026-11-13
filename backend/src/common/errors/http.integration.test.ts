import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../app.js';
import { AppError, errorHandler, requestId } from './index.js';
import { sendData } from '../responses/index.js';

describe('공통 API 오류', () => {
  it('정상 응답은 data와 meta를 반환한다', async () => {
    const fixture = express();
    fixture.get('/', (_req, res) => sendData(res, { id: 'p1' }));
    const response = await request(fixture).get('/');
    expect(response.body).toEqual({ data: { id: 'p1' }, meta: null });
  });
  it('잘못된 JSON과 없는 API에 공통 오류 형식을 반환한다', async () => {
    const malformed = await request(app)
      .post('/api/v1/example')
      .set('Content-Type', 'application/json')
      .send('{');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
    expect(malformed.body.error.requestId).toBeTruthy();
    const missing = await request(app).get('/api/v1/nonexistent');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });
  it('본문 크기 제한을 초과하면 서버 오류 대신 요청 크기 오류를 반환한다', async () => {
    const response = await request(app)
      .post('/api/v1/example')
      .send({ value: 'x'.repeat(110_000) });
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
  it('예상하지 못한 오류의 내부 내용을 노출하지 않는다', async () => {
    const fixture = express();
    fixture.use(requestId);
    fixture.get('/', () => {
      throw new Error('internal secret');
    });
    fixture.use(errorHandler);
    const response = await request(fixture).get('/');
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('internal secret');
  });
  it('알려진 업무 오류는 명시된 코드로 반환한다', async () => {
    const fixture = express();
    fixture.use(requestId);
    fixture.get('/', () => {
      throw new AppError(409, 'CONFLICT', '충돌');
    });
    fixture.use(errorHandler);
    const response = await request(fixture).get('/');
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });
});
