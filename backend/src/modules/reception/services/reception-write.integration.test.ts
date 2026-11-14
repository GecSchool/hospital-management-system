import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import { businessDate } from '../../../common/utils/time.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { parseReceptionCreate } from '../validations/reception.validation.js';
import { createReception, deleteReception } from './reception.service.js';
import express from 'express';
import request from 'supertest';
import { createAccountProvider } from '../../../common/middlewares/account-provider.js';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import { errorHandler } from '../../../common/errors/index.js';
import * as controller from '../controllers/reception.controller.js';
const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());

describe('접수 생성·삭제', () => {
  it('예약과 현장 접수 요청을 상호 배타적으로 검증한다', () => {
    expect(parseReceptionCreate({ appointmentId: 'a' })).toEqual({ appointmentId: 'a' });
    expect(() => parseReceptionCreate({ appointmentId: 'a', patientId: 'p' })).toThrow();
    expect(() => parseReceptionCreate({ patientId: 'p', departmentId: 'd' })).toThrow();
    expect(() => parseReceptionCreate({ appointmentId: 'a', extra: 'x' })).toThrow();
  });
  it('예약 접수는 당일만 가능하며 삭제해도 예약은 유지되어 재접수할 수 있다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const staff = await tx.account.create({
        data: {
          name: '직원',
          email: `staff-${f.admin.id}@example.test`,
          role: 'STAFF',
          passwordHash: 'test',
        },
      });
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        new Proxy(tx, {
          get(t, k, r) {
            if (k === '$transaction')
              return async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx);
            return Reflect.get(t, k, r);
          },
        }) as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const actor = {
        id: staff.id,
        role: 'STAFF' as const,
        status: 'ACTIVE' as const,
        departmentId: null,
      };
      const today = businessDate(new Date());
      const apt = await tx.appointment.create({
        data: {
          patientId: f.patient.id,
          departmentId: f.department.id,
          doctorAccountId: f.doctor.id,
          registeredByAccountId: staff.id,
          startsAt: new Date(`${today}T09:00:00+09:00`),
        },
      });
      const tomorrow = new Date(new Date(`${today}T00:00:00+09:00`).getTime() + 86400000);
      const nextApt = await tx.appointment.create({
        data: {
          patientId: f.patient.id,
          departmentId: f.department.id,
          doctorAccountId: f.doctor.id,
          registeredByAccountId: staff.id,
          startsAt: tomorrow,
        },
      });
      await expect(createReception(actor, { appointmentId: nextApt.id })).rejects.toMatchObject({
        status: 409,
      });
      const entry = (await createReception(actor, { appointmentId: apt.id })) as {
        id: string;
        appointmentId: string;
      };
      expect(entry.appointmentId).toBe(apt.id);
      await expect(createReception(actor, { appointmentId: apt.id })).rejects.toMatchObject({
        status: 409,
      });
      await deleteReception(actor, entry.id);
      expect(await tx.reception.findUnique({ where: { id: entry.id } })).toBeNull();
      expect((await tx.appointment.findUniqueOrThrow({ where: { id: apt.id } })).status).toBe(
        'BOOKED',
      );
      expect(
        ((await createReception(actor, { appointmentId: apt.id })) as { id: string }).id,
      ).not.toBe(entry.id);
    });
  });
  it('HTTP 경로는 직원 권한과 요청 형식을 검사하며 삭제는 본문 없는 204다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const staff = await tx.account.create({
        data: {
          name: '직원',
          email: `staff-${f.admin.id}@example.test`,
          role: 'STAFF',
          passwordHash: 'test',
        },
      });
      let id: string | null = staff.id;
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        new Proxy(tx, {
          get(t, k, r) {
            if (k === '$transaction')
              return async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx);
            return Reflect.get(t, k, r);
          },
        }) as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const app = express();
      app.locals.accountProvider = createAccountProvider(
        async () => id,
        () => tx,
      );
      app.use(express.json());
      app.post('/receptions', requireAccount, requireRole('STAFF'), controller.create);
      app.delete(
        '/receptions/:receptionId',
        requireAccount,
        requireRole('STAFF'),
        controller.remove,
      );
      app.use(errorHandler);
      expect(
        (await request(app).post('/receptions').send({ appointmentId: 'x', patientId: 'y' }))
          .status,
      ).toBe(400);
      const result = await request(app)
        .post('/receptions')
        .send({ patientId: f.patient.id, doctorId: f.doctor.id, departmentId: f.department.id });
      expect(result.status).toBe(201);
      id = f.nurse.id;
      expect((await request(app).delete(`/receptions/${result.body.data.id}`)).status).toBe(403);
      id = staff.id;
      const deleted = await request(app).delete(`/receptions/${result.body.data.id}`);
      expect(deleted.status).toBe(204);
      expect(deleted.text).toBe('');
      id = null;
      expect((await request(app).post('/receptions').send({})).status).toBe(401);
    });
  });
  it('현장 접수는 같은 환자·의사 당일 미완료 중복을 막고 완료 후 재접수를 허용한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const staff = await tx.account.create({
        data: {
          name: '직원',
          email: `staff-${f.admin.id}@example.test`,
          role: 'STAFF',
          passwordHash: 'test',
        },
      });
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        new Proxy(tx, {
          get(t, k, r) {
            if (k === '$transaction')
              return async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx);
            return Reflect.get(t, k, r);
          },
        }) as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const actor = {
        id: staff.id,
        role: 'STAFF' as const,
        status: 'ACTIVE' as const,
        departmentId: null,
      };
      const input = {
        patientId: f.patient.id,
        departmentId: f.department.id,
        doctorId: f.doctor.id,
      };
      const first = (await createReception(actor, input)) as { id: string };
      await expect(createReception(actor, input)).rejects.toMatchObject({
        status: 409,
        code: 'DUPLICATE_ACTIVE_RECEPTION',
      });
      const otherDoctor = await tx.account.create({
        data: {
          email: `doctor2-${f.admin.id}@example.test`,
          name: '다른 의사',
          passwordHash: 'test',
          role: 'DOCTOR',
          doctor: { create: { departmentId: f.department.id } },
        },
      });
      const other = (await createReception(actor, { ...input, doctorId: otherDoctor.id })) as {
        id: string;
      };
      expect(other.id).not.toBe(first.id);
      const now = new Date();
      await tx.visit.create({
        data: { receptionId: first.id, status: 'COMPLETED', startedAt: now, completedAt: now },
      });
      const again = (await createReception(actor, input)) as { id: string };
      expect(again.id).not.toBe(first.id);
      await expect(deleteReception(actor, first.id)).rejects.toMatchObject({
        status: 409,
        code: 'VISIT_ALREADY_STARTED',
      });
      await tx.nursingRecord.create({
        data: { receptionId: again.id, originalAuthorAccountId: f.nurse.id },
      });
      await expect(deleteReception(actor, again.id)).rejects.toMatchObject({
        status: 409,
        code: 'RECEPTION_HAS_NURSING_RECORDS',
      });
    });
  });
  it('동일 환자·의사 동시 접수와 간호기록 생성 대 접수 삭제의 경합을 방지한다', async () => {
    const f = await createMedicalStaffFixture(prisma);
    const staff = await prisma.account.create({
      data: {
        name: '직원',
        email: `staff-${f.admin.id}@example.test`,
        role: 'STAFF',
        passwordHash: 'test',
      },
    });
    const actor = {
      id: staff.id,
      role: 'STAFF' as const,
      status: 'ACTIVE' as const,
      departmentId: null,
    };
    vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(prisma);
    let release!: () => void, locked!: () => void;
    const untilRelease = new Promise<void>((resolve) => {
      release = resolve;
    });
    const acquired = new Promise<void>((resolve) => {
      locked = resolve;
    });
    try {
      const data = {
        patientId: f.patient.id,
        departmentId: f.department.id,
        doctorId: f.doctor.id,
      };
      const results = await Promise.allSettled([
        createReception(actor, data),
        createReception(actor, data),
      ]);
      expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((x) => x.status === 'rejected')).toMatchObject({
        status: 'rejected',
        reason: { code: 'DUPLICATE_ACTIVE_RECEPTION' },
      });
      const entry = await prisma.reception.findFirstOrThrow({
        where: { patientId: f.patient.id, doctorAccountId: f.doctor.id },
      });
      const writing = prisma.$transaction(async (tx) => {
        await tx.nursingRecord.create({
          data: { receptionId: entry.id, originalAuthorAccountId: f.nurse.id },
        });
        locked();
        await untilRelease;
      });
      await acquired;
      const deleting = expect(deleteReception(actor, entry.id)).rejects.toMatchObject({
        status: 409,
        code: 'RECEPTION_HAS_NURSING_RECORDS',
      });
      release();
      await writing;
      await deleting;
      expect(await prisma.reception.findUnique({ where: { id: entry.id } })).not.toBeNull();
    } finally {
      release();
      await prisma.nursingRecord.deleteMany({ where: { originalAuthorAccountId: f.nurse.id } });
      await prisma.reception.deleteMany({ where: { patientId: f.patient.id } });
      await prisma.patient.delete({ where: { id: f.patient.id } });
      await prisma.doctor.delete({ where: { accountId: f.doctor.id } });
      await prisma.nurse.delete({ where: { accountId: f.nurse.id } });
      await prisma.account.deleteMany({
        where: { id: { in: [staff.id, f.admin.id, f.doctor.id, f.nurse.id] } },
      });
      await prisma.department.deleteMany({
        where: { id: { in: [f.department.id, f.otherDepartment.id, f.inactiveDepartment.id] } },
      });
    }
  });
});
