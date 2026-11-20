import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as prismaConfig from '../../src/config/prisma.js';
import { testDatabaseUrl } from '../../scripts/test-db-config.mjs';
import {
  createAuthFixture,
  createAuthTestApp,
  TEST_PASSWORD,
  useTransactionAsDatabase,
} from '../helpers/auth-app.js';
import { withRollback } from '../helpers/transaction.js';

const prisma = prismaConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());

describe('조회 캐시와 변경 후 최신화', () => {
  it('진료과 이름, 의사 소속·상태, 간호사 접근 권한 변경을 반영한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createAuthFixture(tx);
      useTransactionAsDatabase(tx);
      const { app, store } = createAuthTestApp();
      const login = async (email: string) => {
        const agent = request.agent(app);
        expect(
          (await agent.post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD })).status,
        ).toBe(200);
        return agent;
      };
      const admin = await login(f.admin.email);
      const nurse = await login(f.nurse.email);
      const departments = '/api/v1/departments';
      const doctorList = `${departments}/${f.department.id}/doctors?activeOnly=true`;
      expect((await admin.get(departments)).status).toBe(200);
      expect((await admin.get(doctorList)).body.data[0].department.name).toBe(f.department.name);
      expect((await nurse.get(doctorList)).status).toBe(200);
      expect(await store.get(`hospital:doctor-list:v1:0:${f.department.id}:active`)).not.toBeNull();
      const newName = `updated-${f.key}`;
      expect(
        (await admin.patch(`${departments}/${f.department.id}`).send({ name: newName })).status,
      ).toBe(200);
      expect(
        (await admin.get(departments)).body.data.find(
          (d: { id: string }) => d.id === f.department.id,
        ).name,
      ).toBe(newName);
      expect((await admin.get(doctorList)).body.data[0].department.name).toBe(newName);
      expect(
        (
          await admin
            .patch(`/api/v1/medical-staff/${f.doctor.id}/department`)
            .send({ departmentId: f.emptyDepartment.id })
        ).status,
      ).toBe(200);
      expect((await admin.get(doctorList)).body.data).toEqual([]);
      const movedList = `${departments}/${f.emptyDepartment.id}/doctors`;
      expect((await admin.get(movedList).query({ activeOnly: 'true' })).body.data).toHaveLength(1);
      expect((await nurse.get(movedList).query({ activeOnly: 'true' })).status).toBe(403);
      expect(
        (await admin.patch(`/api/v1/accounts/${f.doctor.id}/status`).send({ status: 'INACTIVE' }))
          .status,
      ).toBe(200);
      expect((await admin.get(movedList).query({ activeOnly: 'true' })).body.data).toEqual([]);
      expect((await admin.get(movedList).query({ activeOnly: 'false' })).body.data).toHaveLength(1);
      expect(await store.get('hospital:doctor-list:v1:generation')).not.toBeNull();
    });
  });
  it('의사 초대 수락 이후 이미 캐시된 진료과 의사 목록에 새 의사를 반영한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createAuthFixture(tx);
      useTransactionAsDatabase(tx);
      const test = createAuthTestApp();
      const admin = request.agent(test.app);
      expect(
        (
          await admin
            .post('/api/v1/auth/login')
            .send({ email: f.admin.email, password: TEST_PASSWORD })
        ).status,
      ).toBe(200);
      const path = `/api/v1/departments/${f.department.id}/doctors?activeOnly=true`;
      expect((await admin.get(path)).body.data).toHaveLength(1);
      const email = `invited-${f.key}@example.test`;
      expect(
        (
          await admin
            .post('/api/v1/account-invitations')
            .send({ name: '새 의사', email, role: 'DOCTOR', departmentId: f.department.id })
        ).status,
      ).toBe(200);
      const password = 'new-account-pass1';
      expect(
        (
          await request(test.app)
            .post('/api/v1/auth/invitations/accept')
            .send({ token: test.lastToken(), password, passwordConfirm: password })
        ).status,
      ).toBe(201);
      expect((await admin.get(path)).body.data).toHaveLength(2);
    });
  });
});
