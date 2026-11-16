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
import { INVITATION_TTL_SECONDS } from '../auth-policy.js';

const prisma = prismaConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const NEW_PASSWORD = 'new-account-pass1';

async function setup(tx: Prisma.TransactionClient) {
  const f = await createAuthFixture(tx);
  useTransactionAsDatabase(tx);
  const test = createAuthTestApp();
  const admin = request.agent(test.app);
  await admin.post('/api/v1/auth/login').send({ email: f.admin.email, password: TEST_PASSWORD });
  const invite = (body: object) => admin.post('/api/v1/account-invitations').send(body);
  const verify = (token: string) =>
    request(test.app).post('/api/v1/auth/invitations/verify').send({ token });
  const accept = (token: string, password = NEW_PASSWORD, passwordConfirm = password) =>
    request(test.app)
      .post('/api/v1/auth/invitations/accept')
      .send({ token, password, passwordConfirm });
  return { f, ...test, admin, invite, verify, accept };
}

describe('계정 초대와 가입 (ACC-03, AUTH-04~05)', () => {
  it('초대 메일의 링크로 비밀번호를 설정하면 계정이 생기고 로그인할 수 있다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, app, sent, lastToken, invite, verify, accept } = await setup(tx);
      const email = `new-doctor-${f.key}@example.test`;

      const invited = await invite({
        name: ' 김의사 ',
        email: ` ${email.toUpperCase()} `,
        role: 'DOCTOR',
        departmentId: f.department.id,
      });
      expect(invited.status).toBe(200);
      expect(invited.body).toEqual({ data: { message: '초대 메일을 발송했습니다.' }, meta: null });
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe(email);
      expect(sent[0].text).toContain(`${APP_BASE_URL}/invitations/accept#token=`);
      // 수락 전에는 계정을 만들지 않고, 응답에 토큰을 싣지 않는다.
      expect(await tx.account.findUnique({ where: { email } })).toBeNull();
      const token = lastToken();
      expect(JSON.stringify(invited.body)).not.toContain(token);

      const verified = await verify(token);
      expect(verified.status).toBe(200);
      expect(verified.body.data).toEqual({
        name: '김의사',
        email,
        role: 'DOCTOR',
        department: { id: f.department.id, name: f.department.name, status: 'ACTIVE' },
      });

      // 비밀번호 입력이 잘못되어도 링크는 계속 쓸 수 있다.
      const mismatch = await accept(token, NEW_PASSWORD, 'different-password');
      expect(mismatch.status).toBe(422);
      expect(mismatch.body.error.code).toBe('PASSWORD_MISMATCH');
      const short = await accept(token, 'short');
      expect(short.status).toBe(400);
      expect(short.body.error.code).toBe('VALIDATION_ERROR');
      // 숫자만으로 된 비밀번호는 길이가 충분해도 거절한다.
      const digitsOnly = await accept(token, '12345678');
      expect(digitsOnly.status).toBe(400);
      expect(digitsOnly.body.error.message).toBe(
        '비밀번호는 영문과 숫자를 모두 포함해 8자 이상으로 입력해 주세요.',
      );

      const accepted = await accept(token);
      expect(accepted.status).toBe(201);
      const created = await tx.account.findUniqueOrThrow({
        where: { email },
        include: { doctor: true },
      });
      expect(accepted.body).toEqual({ data: { accountId: created.id }, meta: null });
      expect(created).toMatchObject({ name: '김의사', role: 'DOCTOR', status: 'ACTIVE' });
      expect(created.doctor?.departmentId).toBe(f.department.id);
      expect(created.passwordHash).toMatch(/^\$argon2id\$/);
      expect(created.passwordHash).not.toContain(NEW_PASSWORD);

      // 한 번 쓴 링크는 다시 쓸 수 없다.
      expect((await verify(token)).status).toBe(410);
      const reused = await accept(token);
      expect(reused.status).toBe(410);
      expect(reused.body.error.code).toBe('INVITATION_INVALID');

      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: NEW_PASSWORD });
      expect(login.status).toBe(200);
      expect(login.body.data).toMatchObject({ id: created.id, doctorId: created.id });
    });
  });

  it('간호사·직원·관리자도 역할에 맞게 가입된다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, lastToken, invite, verify, accept } = await setup(tx);
      const nurseEmail = `new-nurse-${f.key}@example.test`;
      await invite({
        name: '간호사',
        email: nurseEmail,
        role: 'NURSE',
        departmentId: f.department.id,
      });
      await accept(lastToken());
      const nurse = await tx.account.findUniqueOrThrow({
        where: { email: nurseEmail },
        include: { nurse: true, doctor: true },
      });
      expect(nurse.nurse?.departmentId).toBe(f.department.id);
      expect(nurse.doctor).toBeNull();

      for (const role of ['STAFF', 'ADMIN'] as const) {
        const email = `new-${role.toLowerCase()}-${f.key}@example.test`;
        expect((await invite({ name: role, email, role })).status).toBe(200);
        expect((await verify(lastToken())).body.data.department).toBeNull();
        expect((await accept(lastToken())).status).toBe(201);
        const account = await tx.account.findUniqueOrThrow({
          where: { email },
          include: { nurse: true, doctor: true },
        });
        expect(account).toMatchObject({ role, doctor: null, nurse: null });
      }
    });
  });

  it('관리자만 초대할 수 있다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, app, sent } = await setup(tx);
      const body = { name: '직원', email: `x-${f.key}@example.test`, role: 'STAFF' };
      expect((await request(app).post('/api/v1/account-invitations').send(body)).status).toBe(401);
      const staff = request.agent(app);
      await staff
        .post('/api/v1/auth/login')
        .send({ email: f.staff.email, password: TEST_PASSWORD });
      expect((await staff.post('/api/v1/account-invitations').send(body)).status).toBe(403);
      expect(sent).toHaveLength(0);
    });
  });

  it('잘못된 초대 요청을 거부하고 메일을 보내지 않는다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, sent, invite } = await setup(tx);
      const email = `x-${f.key}@example.test`;
      const invalid = [
        {},
        { name: '', email, role: 'STAFF' },
        { name: 'a'.repeat(51), email, role: 'STAFF' },
        { name: '이름', email: 'not-an-email', role: 'STAFF' },
        { name: '이름', email, role: 'PATIENT' },
        { name: '이름', email, role: 'DOCTOR' },
        { name: '이름', email, role: 'NURSE', departmentId: '' },
        { name: '이름', email, role: 'STAFF', departmentId: f.department.id },
        { name: '이름', email, role: 'ADMIN', departmentId: f.department.id },
      ];
      for (const body of invalid) {
        const response = await invite(body);
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }
      const duplicate = await invite({ name: '이름', email: f.staff.email, role: 'STAFF' });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe('ACCOUNT_EMAIL_DUPLICATE');
      const missing = await invite({
        name: '이름',
        email,
        role: 'DOCTOR',
        departmentId: 'missing',
      });
      expect(missing.status).toBe(404);
      const inactive = await invite({
        name: '이름',
        email,
        role: 'DOCTOR',
        departmentId: f.inactiveDepartment.id,
      });
      expect(inactive.status).toBe(409);
      expect(sent).toHaveLength(0);
    });
  });

  it('같은 이메일로 다시 초대하면 이전 링크는 사용할 수 없다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, lastToken, invite, verify, accept } = await setup(tx);
      const body = { name: '직원', email: `again-${f.key}@example.test`, role: 'STAFF' };
      await invite(body);
      const first = lastToken();
      await invite(body);
      const second = lastToken();
      expect(second).not.toBe(first);
      expect((await verify(first)).status).toBe(410);
      expect((await accept(first)).status).toBe(410);
      expect((await verify(second)).status).toBe(200);
    });
  });

  it('메일 발송에 실패하면 오류를 반환하고 이전 링크는 그대로 유효하다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, sent, lastToken, setMailFails, invite, verify } = await setup(tx);
      const body = { name: '직원', email: `mail-${f.key}@example.test`, role: 'STAFF' };
      await invite(body);
      const first = lastToken();
      setMailFails(true);
      const failed = await invite(body);
      expect(failed.status).toBe(503);
      expect(failed.body.error.code).toBe('MAIL_SEND_FAILED');
      expect(failed.body.error.message).not.toContain('SMTP');
      expect(sent).toHaveLength(1);
      expect((await verify(first)).status).toBe(200);
    });
  });

  it('유효 시간이 지난 링크와 임의의 토큰은 사용할 수 없다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, lastToken, invite, verify, accept } = await setup(tx);
      vi.useFakeTimers({ toFake: ['Date'] });
      await invite({ name: '직원', email: `late-${f.key}@example.test`, role: 'STAFF' });
      const token = lastToken();
      vi.setSystemTime(Date.now() + (INVITATION_TTL_SECONDS - 60) * 1000);
      expect((await verify(token)).status).toBe(200);
      vi.setSystemTime(Date.now() + 120 * 1000);
      expect((await verify(token)).status).toBe(410);
      expect((await accept(token)).status).toBe(410);
      expect((await verify('made-up-token')).status).toBe(410);
      expect((await verify('')).status).toBe(400);
      expect(
        (await request(createAuthTestApp().app).post('/api/v1/auth/invitations/verify').send({}))
          .status,
      ).toBe(400);
    });
  });

  it('같은 링크로 동시에 가입을 요청해도 계정은 하나만 생긴다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, lastToken, invite, accept } = await setup(tx);
      const email = `race-${f.key}@example.test`;
      await invite({ name: '직원', email, role: 'STAFF' });
      const token = lastToken();
      const statuses = (await Promise.all([accept(token), accept(token)])).map((r) => r.status);
      expect(statuses.sort()).toEqual([201, 410]);
      expect(await tx.account.count({ where: { email } })).toBe(1);
    });
  });

  it('초대 후 진료과가 비활성화되면 가입을 막고, 다시 활성화되면 같은 링크로 가입할 수 있다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, lastToken, invite, accept } = await setup(tx);
      const email = `dept-${f.key}@example.test`;
      await invite({ name: '의사', email, role: 'DOCTOR', departmentId: f.emptyDepartment.id });
      const token = lastToken();
      await tx.department.update({
        where: { id: f.emptyDepartment.id },
        data: { status: 'INACTIVE' },
      });
      const blocked = await accept(token);
      expect(blocked.status).toBe(409);
      expect(await tx.account.findUnique({ where: { email } })).toBeNull();
      await tx.department.update({
        where: { id: f.emptyDepartment.id },
        data: { status: 'ACTIVE' },
      });
      expect((await accept(token)).status).toBe(201);
    });
  });

  it('초대 후 같은 이메일의 계정이 먼저 생겼다면 가입을 거부한다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, lastToken, invite, accept } = await setup(tx);
      const email = `taken-${f.key}@example.test`;
      await invite({ name: '직원', email, role: 'STAFF' });
      await tx.account.create({ data: { email, name: '먼저', role: 'STAFF', passwordHash: 'x' } });
      const response = await accept(lastToken());
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('ACCOUNT_EMAIL_DUPLICATE');
      expect(await tx.account.count({ where: { email } })).toBe(1);
    });
  });
});
