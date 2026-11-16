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
import type { Prisma } from '../../../generated/prisma/client.js';

const prisma = prismaConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());

async function setup(tx: Prisma.TransactionClient) {
  const f = await createAuthFixture(tx);
  useTransactionAsDatabase(tx);
  const { app } = createAuthTestApp();
  const loginAs = async (email: string) => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD });
    return agent;
  };
  return { f, app, admin: await loginAs(f.admin.email), loginAs };
}

const ids = (response: request.Response) =>
  (response.body.data as { id: string }[]).map((department) => department.id);

describe('진료과 관리 (DEP-01~05)', () => {
  it('로그인하지 않으면 모든 요청을 거부한다', async () => {
    const { app } = createAuthTestApp();
    expect((await request(app).get('/api/v1/departments')).status).toBe(401);
    expect((await request(app).post('/api/v1/departments').send({ name: 'x' })).status).toBe(401);
    expect((await request(app).patch('/api/v1/departments/x').send({ name: 'x' })).status).toBe(
      401,
    );
    expect(
      (await request(app).patch('/api/v1/departments/x/status').send({ status: 'ACTIVE' })).status,
    ).toBe(401);
    expect((await request(app).delete('/api/v1/departments/x')).status).toBe(401);
  });

  it('관리자는 비활성 진료과까지 이름순으로 조회하고 상태로 걸러 볼 수 있다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, admin } = await setup(tx);
      const all = await admin.get('/api/v1/departments');
      expect(all.status).toBe(200);
      expect(all.body.meta).toBeNull();
      expect(ids(all)).toEqual(
        expect.arrayContaining([f.department.id, f.emptyDepartment.id, f.inactiveDepartment.id]),
      );
      const names = (all.body.data as { name: string }[]).map((department) => department.name);
      expect(names).toEqual([...names].sort());
      expect(all.body.data.find((d: { id: string }) => d.id === f.department.id)).toEqual({
        id: f.department.id,
        name: f.department.name,
        status: 'ACTIVE',
      });

      const active = await admin.get('/api/v1/departments').query({ status: 'ACTIVE' });
      expect(ids(active)).toContain(f.department.id);
      expect(ids(active)).not.toContain(f.inactiveDepartment.id);
      const inactive = await admin.get('/api/v1/departments').query({ status: 'INACTIVE' });
      expect(ids(inactive)).toContain(f.inactiveDepartment.id);
      expect(ids(inactive)).not.toContain(f.department.id);
      expect((await admin.get('/api/v1/departments').query({ status: 'DELETED' })).status).toBe(
        400,
      );
    });
  });

  it('관리자가 아닌 역할은 활성 진료과만 조회하고 변경할 수 없다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, loginAs } = await setup(tx);
      for (const account of [f.staff, f.doctor, f.nurse]) {
        const agent = await loginAs(account.email);
        const list = await agent.get('/api/v1/departments');
        expect(list.status).toBe(200);
        expect(ids(list)).toContain(f.department.id);
        expect(ids(list)).not.toContain(f.inactiveDepartment.id);
        expect((await agent.get('/api/v1/departments').query({ status: 'INACTIVE' })).status).toBe(
          403,
        );
        const url = `/api/v1/departments/${f.emptyDepartment.id}`;
        expect((await agent.post('/api/v1/departments').send({ name: '새 과' })).status).toBe(403);
        expect((await agent.patch(url).send({ name: '새 이름' })).status).toBe(403);
        expect((await agent.patch(`${url}/status`).send({ status: 'INACTIVE' })).status).toBe(403);
        expect((await agent.delete(url)).status).toBe(403);
      }
      const unchanged = await tx.department.findUniqueOrThrow({
        where: { id: f.emptyDepartment.id },
      });
      expect(unchanged).toMatchObject({ name: f.emptyDepartment.name, status: 'ACTIVE' });
    });
  });

  it('진료과를 등록하고 같은 이름은 거부한다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, admin } = await setup(tx);
      const name = `신경과-${f.key}`;
      const created = await admin.post('/api/v1/departments').send({ name: `  ${name}  ` });
      expect(created.status).toBe(201);
      expect(created.body).toEqual({
        data: { id: expect.any(String), name, status: 'ACTIVE' },
        meta: null,
      });
      expect(await tx.department.findUnique({ where: { id: created.body.data.id } })).toMatchObject(
        { name, status: 'ACTIVE' },
      );

      const duplicate = await admin.post('/api/v1/departments').send({ name });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe('DEPARTMENT_NAME_DUPLICATE');
      for (const body of [
        {},
        { name: '' },
        { name: '   ' },
        { name: 'a'.repeat(51) },
        { name: 1 },
      ]) {
        const invalid = await admin.post('/api/v1/departments').send(body);
        expect(invalid.status).toBe(400);
        expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  it('진료과 이름을 바꾸고 다른 과와 겹치는 이름은 거부한다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, admin } = await setup(tx);
      const url = `/api/v1/departments/${f.emptyDepartment.id}`;
      const name = `바뀐 이름-${f.key}`;
      const renamed = await admin.patch(url).send({ name });
      expect(renamed.status).toBe(200);
      expect(renamed.body.data).toEqual({ id: f.emptyDepartment.id, name, status: 'ACTIVE' });
      // 같은 이름으로 다시 저장해도 오류가 아니다.
      expect((await admin.patch(url).send({ name })).status).toBe(200);

      const duplicate = await admin.patch(url).send({ name: f.department.name });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe('DEPARTMENT_NAME_DUPLICATE');
      expect((await admin.patch(url).send({ name: '' })).status).toBe(400);
      expect((await admin.patch('/api/v1/departments/missing').send({ name })).status).toBe(404);
      expect(
        (await tx.department.findUniqueOrThrow({ where: { id: f.emptyDepartment.id } })).name,
      ).toBe(name);
    });
  });

  it('소속 의료진이 있는 진료과는 비활성화할 수 없다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, admin } = await setup(tx);
      const blocked = await admin
        .patch(`/api/v1/departments/${f.department.id}/status`)
        .send({ status: 'INACTIVE' });
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe('DEPARTMENT_HAS_STAFF');
      expect(
        (await tx.department.findUniqueOrThrow({ where: { id: f.department.id } })).status,
      ).toBe('ACTIVE');

      const url = `/api/v1/departments/${f.emptyDepartment.id}/status`;
      const deactivated = await admin.patch(url).send({ status: 'INACTIVE' });
      expect(deactivated.status).toBe(200);
      expect(deactivated.body.data).toMatchObject({ id: f.emptyDepartment.id, status: 'INACTIVE' });
      expect((await admin.patch(url).send({ status: 'INACTIVE' })).status).toBe(200);
      const activated = await admin.patch(url).send({ status: 'ACTIVE' });
      expect(activated.body.data.status).toBe('ACTIVE');

      expect((await admin.patch(url).send({ status: 'CLOSED' })).status).toBe(400);
      expect((await admin.patch(url).send({})).status).toBe(400);
      expect(
        (await admin.patch('/api/v1/departments/missing/status').send({ status: 'ACTIVE' })).status,
      ).toBe(404);
    });
  });

  it('의료진을 다른 과로 옮긴 뒤에는 비활성화할 수 있다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, admin } = await setup(tx);
      for (const account of [f.doctor, f.nurse]) {
        const moved = await admin
          .patch(`/api/v1/medical-staff/${account.id}/department`)
          .send({ departmentId: f.emptyDepartment.id });
        expect(moved.status).toBe(200);
      }
      const response = await admin
        .patch(`/api/v1/departments/${f.department.id}/status`)
        .send({ status: 'INACTIVE' });
      expect(response.status).toBe(200);
    });
  });

  it('의료진이나 예약·접수 이력이 있는 진료과는 삭제할 수 없다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, admin } = await setup(tx);
      const withStaff = await admin.delete(`/api/v1/departments/${f.department.id}`);
      expect(withStaff.status).toBe(409);
      expect(withStaff.body.error.code).toBe('DEPARTMENT_IN_USE');

      const patient = await tx.patient.create({
        data: {
          patientNumber: `test-${f.key}`,
          name: 'test',
          residentNumberCiphertext: Buffer.from('synthetic'),
          residentNumberLookup: Buffer.from(f.key),
          birthDate: new Date('2000-01-01T00:00:00Z'),
          phone: '010-0000-0000',
        },
      });
      // 취소된 예약만 남아 있어도 이력으로 보아 삭제하지 않는다.
      const appointment = await tx.appointment.create({
        data: {
          patientId: patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.emptyDepartment.id,
          registeredByAccountId: f.staff.id,
          startsAt: new Date('2030-01-07T00:00:00Z'),
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledByAccountId: f.staff.id,
        },
      });
      const url = `/api/v1/departments/${f.emptyDepartment.id}`;
      const withAppointment = await admin.delete(url);
      expect(withAppointment.status).toBe(409);
      expect(withAppointment.body.error.code).toBe('DEPARTMENT_IN_USE');

      await tx.appointment.delete({ where: { id: appointment.id } });
      await tx.reception.create({
        data: {
          patientId: patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.emptyDepartment.id,
        },
      });
      const withReception = await admin.delete(url);
      expect(withReception.status).toBe(409);
      expect(withReception.body.error.code).toBe('DEPARTMENT_IN_USE');
      expect(
        await tx.department.findUnique({ where: { id: f.emptyDepartment.id } }),
      ).not.toBeNull();
    });
  });

  it('참조가 없는 진료과는 삭제된다', async () => {
    await withRollback(prisma, async (tx) => {
      const { f, admin } = await setup(tx);
      const url = `/api/v1/departments/${f.inactiveDepartment.id}`;
      const removed = await admin.delete(url);
      expect(removed.status).toBe(204);
      expect(removed.text).toBe('');
      expect(await tx.department.findUnique({ where: { id: f.inactiveDepartment.id } })).toBeNull();
      expect((await admin.delete(url)).status).toBe(404);
      const list = await admin.get('/api/v1/departments');
      expect(ids(list)).not.toContain(f.inactiveDepartment.id);
    });
  });
});
