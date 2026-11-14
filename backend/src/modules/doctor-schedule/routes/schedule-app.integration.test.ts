import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../../app.js';

describe('실제 앱에 등록된 진료 시간·휴진 경로', () => {
  it('인증되지 않은 모든 일정 요청을 거부한다', async () => {
    expect((await request(app).get('/api/v1/doctors/test/availability')).status).toBe(401);
    expect(
      (await request(app).put('/api/v1/doctors/me/availability').send({ weeklySlots: [] })).status,
    ).toBe(401);
    expect(
      (await request(app).get('/api/v1/doctors/test/leaves?from=2026-01-01&to=2026-12-31')).status,
    ).toBe(401);
    expect(
      (await request(app).post('/api/v1/doctors/me/leaves').send({ date: '2030-01-01' })).status,
    ).toBe(401);
  });
});
