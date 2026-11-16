import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as prismaConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import {
  APP_BASE_URL,
  TEST_PASSWORD,
  createAuthFixture,
  createAuthTestApp,
  useTransactionAsDatabase,
} from '../../../../tests/helpers/auth-app.js';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PASSWORD_RESET_TTL_SECONDS } from '../auth-policy.js';

const prisma = prismaConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const NEW_PASSWORD = 'changed-password-123';

async function setup(tx: Prisma.TransactionClient) {
  const f = await createAuthFixture(tx);
  useTransactionAsDatabase(tx);
  const test = createAuthTestApp();
  const login = (email: string, password = TEST_PASSWORD) =>
    request.agent(test.app).post('/api/v1/auth/login').send({ email, password });
  const admin = request.agent(test.app);
  await admin.post('/api/v1/auth/login').send({ email: f.admin.email, password: TEST_PASSWORD });
  const requestReset = (accountId: string) =>
    admin.post(`/api/v1/accounts/${accountId}/password-reset`);
  const verify = (token: string) =>
    request(test.app).post('/api/v1/auth/password-resets/verify').send({ token });
  const confirm = (token: string, password = NEW_PASSWORD, passwordConfirm = password) =>
    request(test.app)
      .post('/api/v1/auth/password-resets/confirm')
      .send({ token, password, passwordConfirm });
  return { f, ...test, admin, login, requestReset, verify, confirm };
}

describe('비밀번호 초기화 (ACC-05, AUTH-06~07)', () => {
  it('재설정 링크로 비밀번호를 바꾸면 새 비밀번호만 통하고 기존 로그인은 끊긴다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, app, sent, lastToken, login, requestReset, verify, confirm } = await setup(tx);
      const existing = request.agent(app);
      await existing
        .post('/api/v1/auth/login')
        .send({ email: f.staff.email, password: TEST_PASSWORD });
      expect((await existing.get('/api/v1/auth/me')).status).toBe(200);

      const requested = await requestReset(f.staff.id);
      expect(requested.status).toBe(200);
      expect(requested.body).toEqual({
        data: { message: '비밀번호 재설정 메일을 발송했습니다.' },
        meta: null,
      });
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe(f.staff.email);
      expect(sent[0].text).toContain(`${APP_BASE_URL}/password-reset#token=`);
      const token = lastToken();
      expect(JSON.stringify(requested.body)).not.toContain(token);
      // 메일을 보낸 것만으로는 아무것도 바뀌지 않는다.
      expect((await existing.get('/api/v1/auth/me')).status).toBe(200);

      expect((await verify(token)).body).toEqual({ data: { valid: true }, meta: null });
      const mismatch = await confirm(token, NEW_PASSWORD, 'different-password');
      expect(mismatch.status).toBe(422);
      expect(mismatch.body.error.code).toBe('PASSWORD_MISMATCH');
      expect((await confirm(token, 'short')).status).toBe(400);
      // 숫자만, 영문만으로 된 비밀번호는 거절하고 링크는 그대로 쓸 수 있다.
      for (const weak of ['12345678', 'onlyletters']) {
        const rejected = await confirm(token, weak);
        expect(rejected.status).toBe(400);
        expect(rejected.body.error.details).toEqual([{ field: 'password', reason: 'COMPOSITION' }]);
      }

      const confirmed = await confirm(token);
      expect(confirmed.status).toBe(204);
      expect(confirmed.text).toBe('');

      expect((await existing.get('/api/v1/auth/me')).status).toBe(401);
      expect((await login(f.staff.email)).status).toBe(401);
      expect((await login(f.staff.email, NEW_PASSWORD)).status).toBe(200);
      // 다른 계정의 로그인은 영향을 받지 않는다.
      expect((await requestReset(f.staff.id)).status).toBe(200);

      const reused = await confirm(token, 'another-password-1');
      expect(reused.status).toBe(410);
      expect(reused.body.error.code).toBe('RESET_LINK_INVALID');
      expect((await verify(token)).status).toBe(410);
    });
  });

  it('비활성 계정도 비밀번호를 바꿀 수 있지만 상태는 그대로여서 로그인할 수 없다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, lastToken, login, requestReset, confirm } = await setup(tx);
      expect((await requestReset(f.inactive.id)).status).toBe(200);
      expect((await confirm(lastToken())).status).toBe(204);
      const account = await tx.account.findUniqueOrThrow({ where: { id: f.inactive.id } });
      expect(account.status).toBe('INACTIVE');
      const response = await login(f.inactive.email, NEW_PASSWORD);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('ACCOUNT_INACTIVE');
    });
  });

  it('관리자만 요청할 수 있고 없는 계정은 404를 반환한다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, app, sent, requestReset } = await setup(tx);
      const url = `/api/v1/accounts/${f.staff.id}/password-reset`;
      expect((await request(app).post(url)).status).toBe(401);
      const staff = request.agent(app);
      await staff
        .post('/api/v1/auth/login')
        .send({ email: f.staff.email, password: TEST_PASSWORD });
      expect((await staff.post(url)).status).toBe(403);
      expect((await requestReset('missing')).status).toBe(404);
      expect(sent).toHaveLength(0);
    });
  });

  it('다시 요청하면 이전 링크는 무효가 되고, 메일 발송에 실패하면 이전 링크가 유지된다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, lastToken, setMailFails, requestReset, verify } = await setup(tx);
      await requestReset(f.staff.id);
      const first = lastToken();
      await requestReset(f.staff.id);
      const second = lastToken();
      expect((await verify(first)).status).toBe(410);
      expect((await verify(second)).status).toBe(200);
      setMailFails(true);
      const failed = await requestReset(f.staff.id);
      expect(failed.status).toBe(503);
      expect(failed.body.error.code).toBe('MAIL_SEND_FAILED');
      expect((await verify(second)).status).toBe(200);
    });
  });

  it('유효 시간이 지난 링크는 사용할 수 없다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, lastToken, login, requestReset, verify, confirm } = await setup(tx);
      vi.useFakeTimers({ toFake: ['Date'] });
      await requestReset(f.staff.id);
      const token = lastToken();
      vi.setSystemTime(Date.now() + (PASSWORD_RESET_TTL_SECONDS + 1) * 1000);
      expect((await verify(token)).status).toBe(410);
      expect((await confirm(token)).status).toBe(410);
      expect((await login(f.staff.email)).status).toBe(200);
    });
  });

  it('초대 토큰과 재설정 토큰은 서로의 용도로 쓸 수 없다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, app, admin, lastToken, requestReset, verify, confirm } = await setup(tx);
      await requestReset(f.staff.id);
      const resetToken = lastToken();
      await admin
        .post('/api/v1/account-invitations')
        .send({ name: '직원', email: `mix-${f.key}@example.test`, role: 'STAFF' });
      const invitationToken = lastToken();
      expect((await verify(invitationToken)).status).toBe(410);
      expect((await confirm(invitationToken)).status).toBe(410);
      const crossed = await request(app)
        .post('/api/v1/auth/invitations/accept')
        .send({ token: resetToken, password: NEW_PASSWORD, passwordConfirm: NEW_PASSWORD });
      expect(crossed.status).toBe(410);
      // 잘못된 용도로 시도해도 원래 링크는 그대로 쓸 수 있다.
      expect((await verify(resetToken)).status).toBe(200);
    });
  });

  it('같은 링크로 동시에 요청하면 한 번만 처리된다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, lastToken, login, requestReset, confirm } = await setup(tx);
      await requestReset(f.staff.id);
      const token = lastToken();
      const responses = await Promise.all([
        confirm(token, 'first-password-1'),
        confirm(token, 'second-password-2'),
      ]);
      expect(responses.map((r) => r.status).sort()).toEqual([204, 410]);
      const winner = responses[0].status === 204 ? 'first-password-1' : 'second-password-2';
      expect((await login(f.staff.email, winner)).status).toBe(200);
    });
  });
});
