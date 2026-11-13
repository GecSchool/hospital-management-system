import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { app, createApp } from '../../../app.js';
import { createAccountProvider } from '../../../common/middlewares/account-provider.js';
import * as prismaConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { changeAccountStatus } from '../services/account-status.service.js';
import { changeDepartment } from '../../medical-staff/services/medical-staff.service.js';
import { lockDoctorWork } from '../../medical-staff/services/doctor-work-lock.js';

const prisma = prismaConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());

describe('계정 상태와 의료진 소속 변경 API', () => {
  it('인증하지 않은 변경은 거부한다', async () => {
    expect(
      (await request(app).patch('/api/v1/accounts/a/status').send({ status: 'INACTIVE' })).status,
    ).toBe(401);
    expect(
      (await request(app).patch('/api/v1/medical-staff/a/department').send({ departmentId: 'd' }))
        .status,
    ).toBe(401);
  });

  it('관리자만 유효한 값을 사용해 변경할 수 있다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      let actor = f.admin.id;
      const provider = createAccountProvider(
        async () => actor,
        () => tx,
      );
      const db = new Proxy(tx, {
        get(target, key, receiver) {
          if (key === '$transaction')
            return async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx);
          return Reflect.get(target, key, receiver);
        },
      });
      vi.spyOn(prismaConfig, 'getPrismaClient').mockReturnValue(
        db as ReturnType<typeof prismaConfig.getPrismaClient>,
      );
      const server = createApp(
        { port: 3000, corsOrigin: undefined },
        { accountProvider: provider },
      );
      const statusUrl = `/api/v1/accounts/${f.nurse.id}/status`;
      const deptUrl = `/api/v1/medical-staff/${f.nurse.id}/department`;
      expect((await request(server).patch(statusUrl).send({ status: 'OTHER' })).status).toBe(400);
      expect((await request(server).patch(deptUrl).send({})).status).toBe(400);
      expect(
        (
          await request(server)
            .patch('/api/v1/accounts/missing/status')
            .send({ status: 'INACTIVE' })
        ).status,
      ).toBe(404);
      const changed = await request(server)
        .patch(deptUrl)
        .send({ departmentId: f.otherDepartment.id });
      expect(changed.status).toBe(200);
      expect(changed.body.data.department.id).toBe(f.otherDepartment.id);
      expect(
        (await request(server).patch(statusUrl).send({ status: 'INACTIVE' })).body.data.status,
      ).toBe('INACTIVE');
      actor = f.nurse.id;
      expect((await request(server).get('/api/v1/accounts')).body.error.code).toBe(
        'ACCOUNT_INACTIVE',
      );
      actor = f.doctor.id;
      expect((await request(server).patch(statusUrl).send({ status: 'ACTIVE' })).status).toBe(403);
    });
  });

  it('두 관리자가 동시에 스스로를 비활성화해도 마지막 활성 관리자를 유지한다', async ({ skip }) => {
    if (await prisma.account.count({ where: { role: 'ADMIN', status: 'ACTIVE' } })) {
      skip();
      return;
    }
    const id = randomUUID();
    const admins = await Promise.all(
      [0, 1].map((n) =>
        prisma.account.create({
          data: {
            email: `concurrent-${id}-${n}@example.test`,
            name: 'test',
            passwordHash: 'test',
            role: 'ADMIN',
          },
        }),
      ),
    );
    try {
      vi.spyOn(prismaConfig, 'getPrismaClient').mockReturnValue(prisma);
      const results = await Promise.allSettled(
        admins.map((admin) => changeAccountStatus(admin.id, admin.id, 'INACTIVE')),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected');
      expect(rejected).toMatchObject({ status: 'rejected', reason: { code: 'LAST_ACTIVE_ADMIN' } });
      expect(
        await prisma.account.count({
          where: { id: { in: admins.map((a) => a.id) }, status: 'ACTIVE' },
        }),
      ).toBe(1);
    } finally {
      await prisma.account.deleteMany({ where: { id: { in: admins.map((a) => a.id) } } });
    }
  });

  it('같은 의사 잠금을 사용하는 예약 생성이 먼저 완료되면 소속 변경을 거부한다', async () => {
    const f = await createMedicalStaffFixture(prisma);
    let release!: () => void;
    let locked!: () => void;
    const waitForRelease = new Promise<void>((resolve) => {
      release = resolve;
    });
    const lockAcquired = new Promise<void>((resolve) => {
      locked = resolve;
    });
    vi.spyOn(prismaConfig, 'getPrismaClient').mockReturnValue(prisma);
    try {
      const booking = prisma.$transaction(async (tx) => {
        await lockDoctorWork(tx, f.doctor.id);
        await tx.appointment.create({
          data: {
            patientId: f.patient.id,
            doctorAccountId: f.doctor.id,
            departmentId: f.department.id,
            registeredByAccountId: f.admin.id,
            startsAt: new Date(Date.now() + 86400000),
          },
        });
        locked();
        await waitForRelease;
      });
      await lockAcquired;
      const changing = changeDepartment(f.admin.id, f.doctor.id, f.otherDepartment.id);
      release();
      await booking;
      await expect(changing).rejects.toMatchObject({ code: 'DOCTOR_HAS_PENDING_WORK' });
      expect(
        (await prisma.doctor.findUniqueOrThrow({ where: { accountId: f.doctor.id } })).departmentId,
      ).toBe(f.department.id);
    } finally {
      release();
      await prisma.appointment.deleteMany({ where: { doctorAccountId: f.doctor.id } });
      await prisma.patient.delete({ where: { id: f.patient.id } });
      await prisma.doctor.delete({ where: { accountId: f.doctor.id } });
      await prisma.nurse.delete({ where: { accountId: f.nurse.id } });
      await prisma.account.deleteMany({
        where: { id: { in: [f.admin.id, f.doctor.id, f.nurse.id] } },
      });
      await prisma.department.deleteMany({
        where: { id: { in: [f.department.id, f.otherDepartment.id, f.inactiveDepartment.id] } },
      });
    }
  });
});
