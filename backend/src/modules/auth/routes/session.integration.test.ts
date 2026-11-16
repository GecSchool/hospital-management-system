import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as prismaConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import {
  TEST_PASSWORD,
  createAuthFixture,
  createAuthTestApp,
  useTransactionAsDatabase,
} from '../../../../tests/helpers/auth-app.js';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS } from '../auth-policy.js';

const prisma = prismaConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const login = (agent: ReturnType<typeof request.agent>, email: string, password = TEST_PASSWORD) =>
  agent.post('/api/v1/auth/login').send({ email, password });

describe('로그인·로그아웃·내 계정 (AUTH-01~03)', () => {
  it('로그인하면 세션 쿠키를 받고 보호된 API를 사용할 수 있으며 로그아웃하면 끊긴다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createAuthFixture(tx);
      useTransactionAsDatabase(tx);
      const { app } = createAuthTestApp();
      const agent = request.agent(app);

      expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
      const response = await login(agent, f.admin.email);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: {
          id: f.admin.id,
          name: f.admin.name,
          email: f.admin.email,
          role: 'ADMIN',
          status: 'ACTIVE',
          department: null,
          doctorId: null,
        },
        meta: null,
      });
      const cookie = response.headers['set-cookie'][0];
      expect(cookie).toMatch(/^connect\.sid=/);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');

      const me = await agent.get('/api/v1/auth/me');
      expect(me.status).toBe(200);
      expect(me.body.data.id).toBe(f.admin.id);
      expect((await agent.get('/api/v1/accounts')).status).toBe(200);

      expect((await agent.post('/api/v1/auth/logout')).status).toBe(204);
      expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
      expect((await agent.get('/api/v1/accounts')).status).toBe(401);
      // 세션이 없어도 로그아웃은 같은 결과를 낸다.
      expect((await agent.post('/api/v1/auth/logout')).status).toBe(204);
      expect((await request(app).post('/api/v1/auth/logout')).status).toBe(204);
    });
  });

  it('의사는 소속 진료과와 doctorId를 함께 받고 역할 밖의 API는 거부된다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createAuthFixture(tx);
      useTransactionAsDatabase(tx);
      const agent = request.agent(createAuthTestApp().app);
      const response = await login(agent, f.doctor.email);
      expect(response.body.data).toMatchObject({
        role: 'DOCTOR',
        doctorId: f.doctor.id,
        department: { id: f.department.id, name: f.department.name, status: 'ACTIVE' },
      });
      expect((await agent.get('/api/v1/accounts')).status).toBe(403);
    });
  });

  it('이메일의 대소문자와 앞뒤 공백을 구분하지 않는다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createAuthFixture(tx);
      useTransactionAsDatabase(tx);
      const agent = request.agent(createAuthTestApp().app);
      const response = await login(agent, `  ${f.staff.email.toUpperCase()} `);
      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(f.staff.id);
    });
  });

  it('없는 이메일과 틀린 비밀번호를 같은 응답으로 거부한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createAuthFixture(tx);
      useTransactionAsDatabase(tx);
      const { app } = createAuthTestApp();
      const wrong = await login(request.agent(app), f.staff.email, 'wrong-password');
      const unknown = await login(request.agent(app), `nobody-${f.key}@example.test`);
      for (const response of [wrong, unknown]) {
        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
        expect(response.headers['set-cookie']).toBeUndefined();
      }
      expect(wrong.body.error.message).toBe(unknown.body.error.message);
    });
  });

  it('비활성 계정은 비밀번호가 맞을 때만 ACCOUNT_INACTIVE를 받는다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createAuthFixture(tx);
      useTransactionAsDatabase(tx);
      const { app } = createAuthTestApp();
      const correct = await login(request.agent(app), f.inactive.email);
      expect(correct.status).toBe(403);
      expect(correct.body.error.code).toBe('ACCOUNT_INACTIVE');
      expect(correct.headers['set-cookie']).toBeUndefined();
      const wrong = await login(request.agent(app), f.inactive.email, 'wrong-password');
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  it('형식이 잘못된 로그인 요청은 400으로 거부한다', async () => {
    const { app } = createAuthTestApp();
    for (const body of [
      {},
      { email: 'not-an-email', password: 'x' },
      { email: 'a@example.test' },
      { email: 'a@example.test', password: '' },
      { email: ['a@example.test'], password: 'x' },
    ]) {
      const response = await request(app).post('/api/v1/auth/login').send(body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('로그인할 때마다 세션 ID를 새로 발급한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createAuthFixture(tx);
      useTransactionAsDatabase(tx);
      const agent = request.agent(createAuthTestApp().app);
      const first = (await login(agent, f.staff.email)).headers['set-cookie'][0].split(';')[0];
      const second = (await login(agent, f.admin.email)).headers['set-cookie'][0].split(';')[0];
      expect(second).not.toBe(first);
      expect((await agent.get('/api/v1/auth/me')).body.data.id).toBe(f.admin.id);
    });
  });

  it('같은 이메일로 5번 실패하면 올바른 비밀번호도 잠시 거부한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createAuthFixture(tx);
      useTransactionAsDatabase(tx);
      const { app } = createAuthTestApp();
      for (let attempt = 0; attempt < 5; attempt += 1)
        expect((await login(request.agent(app), f.staff.email, 'wrong-password')).status).toBe(401);
      const blocked = await login(request.agent(app), f.staff.email);
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('RATE_LIMITED');
      expect(blocked.headers['retry-after']).toBeTruthy();
      // 다른 계정의 로그인은 영향을 받지 않는다.
      expect((await login(request.agent(app), f.admin.email)).status).toBe(200);
    });
  });

  it('성공한 로그인은 실패 횟수에 포함하지 않는다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createAuthFixture(tx);
      useTransactionAsDatabase(tx);
      const { app } = createAuthTestApp();
      for (let attempt = 0; attempt < 8; attempt += 1)
        expect((await login(request.agent(app), f.staff.email)).status).toBe(200);
    });
  });

  it('로그인 중에 비활성화된 계정은 차단되고 세션도 지워진다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createAuthFixture(tx);
      useTransactionAsDatabase(tx);
      const agent = request.agent(createAuthTestApp().app);
      await login(agent, f.staff.email);
      await tx.account.update({ where: { id: f.staff.id }, data: { status: 'INACTIVE' } });
      const blocked = await agent.get('/api/v1/auth/me');
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('ACCOUNT_INACTIVE');
      // 다시 활성화해도 이전 세션은 되살아나지 않는다.
      await tx.account.update({ where: { id: f.staff.id }, data: { status: 'ACTIVE' } });
      expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
    });
  });

  it('요청이 없으면 1시간 뒤 만료되고, 계속 사용해도 12시간 뒤에는 다시 로그인해야 한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createAuthFixture(tx);
      useTransactionAsDatabase(tx);
      const { app } = createAuthTestApp();
      vi.useFakeTimers({ toFake: ['Date'] });

      const idle = request.agent(app);
      await login(idle, f.staff.email);
      vi.setSystemTime(Date.now() + SESSION_IDLE_MS + 1000);
      expect((await idle.get('/api/v1/auth/me')).status).toBe(401);

      const busy = request.agent(app);
      const startedAt = Date.now();
      await login(busy, f.admin.email);
      const step = SESSION_IDLE_MS - 60_000;
      while (Date.now() + step - startedAt <= SESSION_ABSOLUTE_MS) {
        vi.setSystemTime(Date.now() + step);
        expect((await busy.get('/api/v1/auth/me')).status).toBe(200);
      }
      vi.setSystemTime(startedAt + SESSION_ABSOLUTE_MS + 1000);
      expect((await busy.get('/api/v1/auth/me')).status).toBe(401);
    });
  });

  it('인증이 연결되지 않은 앱에서는 로그인 API가 동작하지 않는다', async () => {
    const { app: bare } = await import('../../../app.js');
    const response = await request(bare)
      .post('/api/v1/auth/login')
      .send({ email: 'a@example.test', password: 'password' });
    expect(response.status).toBe(503);
  });
});
