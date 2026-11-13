import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { app, createApp } from '../../../app.js';
import * as prismaConfig from '../../../config/prisma.js';
import { createAccountProvider } from '../../../common/middlewares/account-provider.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';

const prisma = prismaConfig.createPrismaClient(testDatabaseUrl());
afterAll(async () => {
  await prisma.$disconnect();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function createFixture(tx: Prisma.TransactionClient) {
  const key = randomUUID().replaceAll('-', '');
  const department = await tx.department.create({
    data: { id: `dep_${key}`, name: `test-dep-${key}` },
  });
  const admin = await tx.account.create({
    data: {
      id: `a_${key}`,
      name: `테스트 관리자 ${key}`,
      email: `admin-${key}@example.test`,
      passwordHash: 'secret',
      role: 'ADMIN',
    },
  });
  const doctor = await tx.account.create({
    data: {
      id: `b_${key}`,
      name: `테스트 의사 ${key}`,
      email: `doctor-${key}@example.test`,
      passwordHash: 'secret',
      role: 'DOCTOR',
      doctor: { create: { departmentId: department.id } },
    },
  });
  await tx.account.create({
    data: {
      id: `c_${key}`,
      name: `테스트 간호사 ${key}`,
      email: `nurse-${key}@example.test`,
      passwordHash: 'secret',
      role: 'NURSE',
      status: 'INACTIVE',
      nurse: { create: { departmentId: department.id } },
    },
  });
  let currentId: string | null = admin.id;
  const accountProvider = createAccountProvider(
    async () => currentId,
    () => tx,
  );
  vi.spyOn(prismaConfig, 'getPrismaClient').mockReturnValue(
    tx as ReturnType<typeof prismaConfig.getPrismaClient>,
  );
  const testApp = createApp({ port: 3000, corsOrigin: undefined }, { accountProvider });
  return {
    key,
    department,
    admin,
    doctor,
    testApp,
    setCurrentId: (id: string | null) => {
      currentId = id;
    },
  };
}

describe('계정 목록·상세 및 관리자 권한', () => {
  it('실제 세션이 연결되지 않은 앱은 헤더를 조작해도 접근을 허용하지 않는다', async () => {
    const response = await request(app).get('/api/v1/accounts');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
    const spoofed = await request(app)
      .get('/api/v1/accounts')
      .set('X-Account-Id', 'admin')
      .set('X-Role', 'ADMIN');
    expect(spoofed.status).toBe(401);
  });

  it('관리자는 검색 결과와 페이지 정보를 확인하며 비밀번호는 반환받지 않는다', async () => {
    await withRollback(prisma, async (tx) => {
      const { testApp, key } = await createFixture(tx);
      const first = await request(testApp)
        .get('/api/v1/accounts')
        .query({ name: key, size: '2', page: '1' });
      const second = await request(testApp)
        .get('/api/v1/accounts')
        .query({ name: key, size: '2', page: '2' });
      expect(first.status).toBe(200);
      expect(first.body.data).toHaveLength(2);
      expect(first.body.meta).toEqual({ page: 1, size: 2, totalItems: 3, totalPages: 2 });
      expect(JSON.stringify(first.body)).not.toContain('secret');
      expect(second.body.data).toHaveLength(1);
      expect(
        new Set([...first.body.data, ...second.body.data].map((row: { id: string }) => row.id))
          .size,
      ).toBe(3);
    });
  });

  it('이름·이메일·역할·상태 조건을 함께 적용한다', async () => {
    await withRollback(prisma, async (tx) => {
      const { testApp, key, doctor, department } = await createFixture(tx);
      const response = await request(testApp)
        .get('/api/v1/accounts')
        .query({ name: key, email: 'DOCTOR-', role: 'DOCTOR', status: 'ACTIVE' });
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        id: doctor.id,
        doctorId: doctor.id,
        department: { id: department.id },
      });
      const inactive = await request(testApp)
        .get('/api/v1/accounts')
        .query({ email: key, status: 'INACTIVE' });
      expect(inactive.body.data).toHaveLength(1);
      expect(inactive.body.data[0].role).toBe('NURSE');
    });
  });

  it('검색 결과가 없거나 검색어에 와일드카드 문자가 있으면 빈 결과를 반환한다', async () => {
    await withRollback(prisma, async (tx) => {
      const { testApp, key } = await createFixture(tx);
      const wildcard = await request(testApp)
        .get('/api/v1/accounts')
        .query({ name: key, email: '%' });
      expect(wildcard.body.data).toHaveLength(0);
      const empty = await request(testApp)
        .get('/api/v1/accounts')
        .query({ name: `none-${key}` });
      expect(empty.body).toEqual({
        data: [],
        meta: { page: 1, size: 20, totalItems: 0, totalPages: 0 },
      });
    });
  });

  it('계정 상세에 소속 정보를 반환하고 존재하지 않는 계정은 404로 처리한다', async () => {
    await withRollback(prisma, async (tx) => {
      const { testApp, admin, doctor, department } = await createFixture(tx);
      const detail = await request(testApp).get(`/api/v1/accounts/${doctor.id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data.department.id).toBe(department.id);
      expect(
        (await request(testApp).get(`/api/v1/accounts/${admin.id}`)).body.data.department,
      ).toBeNull();
      expect((await request(testApp).get('/api/v1/accounts/not-found')).status).toBe(404);
      expect(
        (await request(testApp).get('/api/v1/accounts').query({ role: 'INVALID' })).status,
      ).toBe(400);
    });
  });

  it('관리자가 아닌 계정과 역할이 변경된 계정의 접근을 거부한다', async () => {
    await withRollback(prisma, async (tx) => {
      const { testApp, admin, doctor, setCurrentId } = await createFixture(tx);
      setCurrentId(doctor.id);
      expect((await request(testApp).get('/api/v1/accounts')).status).toBe(403);
      await tx.account.update({ where: { id: admin.id }, data: { role: 'STAFF' } });
      setCurrentId(admin.id);
      expect((await request(testApp).get('/api/v1/accounts')).status).toBe(403);
    });
  });

  it('비활성화된 계정과 인증 정보가 없는 요청을 차단한다', async () => {
    await withRollback(prisma, async (tx) => {
      const { testApp, admin, setCurrentId } = await createFixture(tx);
      await tx.account.update({ where: { id: admin.id }, data: { status: 'INACTIVE' } });
      const inactive = await request(testApp).get('/api/v1/accounts');
      expect(inactive.status).toBe(403);
      expect(inactive.body.error.code).toBe('ACCOUNT_INACTIVE');
      setCurrentId(null);
      expect((await request(testApp).get('/api/v1/accounts')).status).toBe(401);
    });
  });
});
