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
  const id = randomUUID().replaceAll('-', '');
  const department = await tx.department.create({ data: { id: `dep_${id}`, name: `test_${id}` } });
  const otherDepartment = await tx.department.create({
    data: { id: `other_${id}`, name: `other_${id}` },
  });
  const createAccount = (
    suffix: string,
    role: 'ADMIN' | 'STAFF' | 'DOCTOR' | 'NURSE',
    status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
  ) =>
    tx.account.create({
      data: {
        id: `${suffix}_${id}`,
        email: `${suffix}-${id}@example.test`,
        name: `${suffix}-${id}`,
        passwordHash: 'sensitive',
        role,
        status,
        ...(role === 'DOCTOR' && { doctor: { create: { departmentId: department.id } } }),
        ...(role === 'NURSE' && { nurse: { create: { departmentId: department.id } } }),
      },
    });
  const admin = await createAccount('admin', 'ADMIN');
  const staff = await createAccount('staff', 'STAFF');
  const doctor = await createAccount('doctor', 'DOCTOR');
  const inactiveDoctor = await createAccount('inactive-doctor', 'DOCTOR', 'INACTIVE');
  const nurse = await createAccount('nurse', 'NURSE');
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
    testApp,
    department,
    otherDepartment,
    staff,
    doctor,
    inactiveDoctor,
    nurse,
    setCurrentId: (value: string | null) => {
      currentId = value;
    },
  };
}

describe('진료과별 의료진·의사 조회', () => {
  it('기본 서버는 인증 없이 조회할 수 없다', async () => {
    expect((await request(app).get('/api/v1/departments/example/medical-staff')).status).toBe(401);
    expect((await request(app).get('/api/v1/departments/example/doctors')).status).toBe(401);
  });

  it('관리자는 소속 의료진 목록과 페이지 정보를 조회한다', async () => {
    await withRollback(prisma, async (tx) => {
      const { testApp, department } = await createFixture(tx);
      const result = await request(testApp)
        .get(`/api/v1/departments/${department.id}/medical-staff`)
        .query({ page: '1', size: '2' });
      expect(result.status).toBe(200);
      expect(result.body.data).toHaveLength(2);
      expect(result.body.meta).toEqual({ page: 1, size: 2, totalItems: 3, totalPages: 2 });
      expect(JSON.stringify(result.body)).not.toContain('sensitive');
    });
  });

  it('관리자 의료진 목록에 역할 필터를 적용한다', async () => {
    await withRollback(prisma, async (tx) => {
      const { testApp, department, nurse } = await createFixture(tx);
      const result = await request(testApp)
        .get(`/api/v1/departments/${department.id}/medical-staff`)
        .query({ role: 'NURSE' });
      expect(result.body.data).toHaveLength(1);
      expect(result.body.data[0]).toMatchObject({
        id: nurse.id,
        role: 'NURSE',
        department: { id: department.id },
        doctorId: null,
      });
      const staff = await request(testApp)
        .get(`/api/v1/departments/${department.id}/medical-staff`)
        .query({ role: 'STAFF' });
      expect(staff.body.data).toEqual([]);
    });
  });

  it('의료진이 없는 진료과는 빈 목록과 페이지 정보를 반환한다', async () => {
    await withRollback(prisma, async (tx) => {
      const { testApp, otherDepartment } = await createFixture(tx);
      const result = await request(testApp).get(
        `/api/v1/departments/${otherDepartment.id}/medical-staff`,
      );
      expect(result.body).toEqual({
        data: [],
        meta: { page: 1, size: 20, totalItems: 0, totalPages: 0 },
      });
    });
  });

  it('잘못된 의료진 역할이나 의사 활성 필터를 거부한다', async () => {
    await withRollback(prisma, async (tx) => {
      const { testApp, department } = await createFixture(tx);
      const invalidRole = await request(testApp)
        .get(`/api/v1/departments/${department.id}/medical-staff`)
        .query({ role: 'INVALID' });
      const invalidActive = await request(testApp)
        .get(`/api/v1/departments/${department.id}/doctors`)
        .query({ activeOnly: '1' });
      expect(invalidRole.status).toBe(400);
      expect(invalidActive.status).toBe(400);
    });
  });

  it('활성 필터가 참이면 활성 의사만, 거짓이나 생략이면 모든 의사를 조회한다', async () => {
    await withRollback(prisma, async (tx) => {
      const { testApp, department, doctor, inactiveDoctor } = await createFixture(tx);
      const path = `/api/v1/departments/${department.id}/doctors`;
      const active = await request(testApp).get(path).query({ activeOnly: 'true' });
      expect(active.status).toBe(200);
      expect(active.body.data).toEqual([
        {
          id: doctor.id,
          name: doctor.name,
          department: { id: department.id, name: department.name, status: 'ACTIVE' },
        },
      ]);
      const all = await request(testApp).get(path).query({ activeOnly: 'false' });
      expect(all.body.data.map((row: { id: string }) => row.id)).toEqual(
        expect.arrayContaining([doctor.id, inactiveDoctor.id]),
      );
      expect(all.body.data).toHaveLength(2);
      expect((await request(testApp).get(path)).body.data).toHaveLength(2);
    });
  });

  it('직원은 의사 목록을 조회할 수 있지만 관리자 의료진 목록은 볼 수 없다', async () => {
    await withRollback(prisma, async (tx) => {
      const { testApp, department, staff, setCurrentId } = await createFixture(tx);
      setCurrentId(staff.id);
      expect(
        (await request(testApp).get(`/api/v1/departments/${department.id}/medical-staff`)).status,
      ).toBe(403);
      expect(
        (await request(testApp).get(`/api/v1/departments/${department.id}/doctors`)).status,
      ).toBe(200);
    });
  });

  it('간호사는 본인 진료과 의사만 조회할 수 있다', async () => {
    await withRollback(prisma, async (tx) => {
      const { testApp, department, otherDepartment, nurse, setCurrentId } = await createFixture(tx);
      setCurrentId(nurse.id);
      expect(
        (await request(testApp).get(`/api/v1/departments/${department.id}/doctors`)).status,
      ).toBe(200);
      expect(
        (await request(testApp).get(`/api/v1/departments/${otherDepartment.id}/doctors`)).status,
      ).toBe(403);
    });
  });

  it('간호사의 소속 변경과 비활성화를 다음 요청에 반영한다', async () => {
    await withRollback(prisma, async (tx) => {
      const { testApp, department, otherDepartment, nurse, setCurrentId } = await createFixture(tx);
      setCurrentId(nurse.id);
      await tx.nurse.update({
        where: { accountId: nurse.id },
        data: { departmentId: otherDepartment.id },
      });
      expect(
        (await request(testApp).get(`/api/v1/departments/${department.id}/doctors`)).status,
      ).toBe(403);
      expect(
        (await request(testApp).get(`/api/v1/departments/${otherDepartment.id}/doctors`)).body.data,
      ).toEqual([]);
      await tx.account.update({ where: { id: nurse.id }, data: { status: 'INACTIVE' } });
      const inactive = await request(testApp).get(
        `/api/v1/departments/${otherDepartment.id}/doctors`,
      );
      expect(inactive.status).toBe(403);
      expect(inactive.body.error.code).toBe('ACCOUNT_INACTIVE');
    });
  });

  it('의사와 인증되지 않은 사용자는 의사 목록에 접근할 수 없다', async () => {
    await withRollback(prisma, async (tx) => {
      const { testApp, department, doctor, setCurrentId } = await createFixture(tx);
      setCurrentId(doctor.id);
      expect(
        (await request(testApp).get(`/api/v1/departments/${department.id}/doctors`)).status,
      ).toBe(403);
      setCurrentId(null);
      expect(
        (await request(testApp).get(`/api/v1/departments/${department.id}/doctors`)).status,
      ).toBe(401);
    });
  });
});
