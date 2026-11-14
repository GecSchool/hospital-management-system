import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import {
  createAppointment,
  changeAppointmentTime,
  cancelAppointment,
} from './appointment.service.js';
import {
  parseAppointmentCreate,
  parseAppointmentTime,
} from '../validations/appointment.validation.js';
import express from 'express';
import request from 'supertest';
import { createAccountProvider } from '../../../common/middlewares/account-provider.js';
import { errorHandler } from '../../../common/errors/index.js';
import { appointmentRouter } from '../routes/appointment.routes.js';
const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());

describe('예약 등록·시간 변경·취소', () => {
  it('요청 시각의 오프셋과 존재하는 날짜를 검사한다', () => {
    expect(() => parseAppointmentTime({ startsAt: '2030-01-01T09:00:00' })).toThrow();
    expect(() => parseAppointmentTime({ startsAt: '2030-02-30T09:00:00+09:00' })).toThrow();
    expect(parseAppointmentTime({ startsAt: '2030-01-01T09:00:00+09:00' }).toISOString()).toBe(
      '2030-01-01T00:00:00.000Z',
    );
    expect(() =>
      parseAppointmentCreate({ patientId: 'a', departmentId: 'b', doctorId: 'c' }),
    ).toThrow();
  });
  it('예약·변경·취소의 권한, 중복 시간과 접수 이후 제한을 확인한다', async () => {
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
      await tx.doctorAvailability.createMany({
        data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          doctorAccountId: f.doctor.id,
          dayOfWeek,
          startMinute: 0,
          endMinute: 1440,
        })),
      });
      const db = new Proxy(tx, {
        get(target, key, receiver) {
          if (key === '$transaction')
            return async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx);
          return Reflect.get(target, key, receiver);
        },
      });
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        db as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const actor = {
        id: staff.id,
        role: 'STAFF' as const,
        status: 'ACTIVE' as const,
        departmentId: null,
      };
      const nurse = {
        id: f.nurse.id,
        role: 'NURSE' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      const data = {
        patientId: f.patient.id,
        departmentId: f.department.id,
        doctorId: f.doctor.id,
        startsAt: new Date('2030-01-01T00:00:00Z'),
      };
      const created = (await createAppointment(actor, data)) as {
        id: string;
        registeredBy: { id: string };
        status: string;
      };
      expect(created.status).toBe('BOOKED');
      expect(created.registeredBy.id).toBe(staff.id);
      await expect(createAppointment(nurse, data)).rejects.toMatchObject({
        status: 409,
        code: 'SLOT_UNAVAILABLE',
      });
      await tx.nurse.update({
        where: { accountId: nurse.id },
        data: { departmentId: f.otherDepartment.id },
      });
      await expect(
        createAppointment(nurse, { ...data, startsAt: new Date('2030-01-01T00:20:00Z') }),
      ).rejects.toMatchObject({ status: 403 });
      await tx.nurse.update({
        where: { accountId: nurse.id },
        data: { departmentId: f.department.id },
      });
      const unchanged = (await changeAppointmentTime(actor, created.id, data.startsAt)) as {
        id: string;
      };
      expect(unchanged.id).toBe(created.id);
      await changeAppointmentTime(actor, created.id, new Date('2030-01-01T00:20:00Z'));
      const cancelled = (await cancelAppointment(actor, created.id)) as { status: string };
      expect(cancelled.status).toBe('CANCELLED');
      expect(
        (await tx.appointment.findUniqueOrThrow({ where: { id: created.id } }))
          .cancelledByAccountId,
      ).toBe(staff.id);
      const next = (await createAppointment(actor, data)) as { id: string };
      await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          appointmentId: next.id,
        },
      });
      await expect(cancelAppointment(actor, next.id)).rejects.toMatchObject({
        status: 409,
        code: 'APPOINTMENT_ALREADY_RECEIVED',
      });
      await expect(changeAppointmentTime(actor, next.id, data.startsAt)).rejects.toMatchObject({
        status: 409,
        code: 'APPOINTMENT_ALREADY_RECEIVED',
      });
      const old = await tx.appointment.create({
        data: {
          patientId: f.patient.id,
          departmentId: f.department.id,
          doctorAccountId: f.doctor.id,
          startsAt: new Date('2020-01-01T00:00:00Z'),
          registeredByAccountId: staff.id,
        },
      });
      await tx.doctor.update({
        where: { accountId: f.doctor.id },
        data: { departmentId: f.otherDepartment.id },
      });
      await expect(
        changeAppointmentTime(actor, old.id, new Date('2030-02-01T00:00:00Z')),
      ).rejects.toMatchObject({ status: 409, code: 'SLOT_UNAVAILABLE' });
    });
  });
  it('동일 의사·시각을 동시에 예약하면 한 건만 저장한다', async () => {
    const f = await createMedicalStaffFixture(prisma);
    const staff = await prisma.account.create({
      data: {
        name: '직원',
        email: `staff-${f.admin.id}@example.test`,
        role: 'STAFF',
        passwordHash: 'test',
      },
    });
    vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(prisma);
    try {
      await prisma.doctorAvailability.createMany({
        data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          doctorAccountId: f.doctor.id,
          dayOfWeek,
          startMinute: 0,
          endMinute: 1440,
        })),
      });
      const actor = {
        id: staff.id,
        role: 'STAFF' as const,
        status: 'ACTIVE' as const,
        departmentId: null,
      };
      const data = {
        patientId: f.patient.id,
        departmentId: f.department.id,
        doctorId: f.doctor.id,
        startsAt: new Date('2030-01-01T00:00:00Z'),
      };
      const results = await Promise.allSettled([
        createAppointment(actor, data),
        createAppointment(actor, data),
      ]);
      expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((x) => x.status === 'rejected')).toMatchObject({
        status: 'rejected',
        reason: { code: 'SLOT_UNAVAILABLE' },
      });
      expect(
        await prisma.appointment.count({
          where: { doctorAccountId: f.doctor.id, status: 'BOOKED' },
        }),
      ).toBe(1);
    } finally {
      await prisma.appointment.deleteMany({ where: { doctorAccountId: f.doctor.id } });
      await prisma.doctorAvailability.deleteMany({ where: { doctorAccountId: f.doctor.id } });
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
  it('HTTP 요청은 인증·역할을 확인하고 예약을 생성한다', async () => {
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
      await tx.doctorAvailability.createMany({
        data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          doctorAccountId: f.doctor.id,
          dayOfWeek,
          startMinute: 0,
          endMinute: 1440,
        })),
      });
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        new Proxy(tx, {
          get(target, key, receiver) {
            if (key === '$transaction')
              return async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx);
            return Reflect.get(target, key, receiver);
          },
        }) as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      let id: string | null = staff.id;
      const app = express();
      app.locals.accountProvider = createAccountProvider(
        async () => id,
        () => tx,
      );
      app.use(express.json(), appointmentRouter, errorHandler);
      const payload = {
        patientId: f.patient.id,
        departmentId: f.department.id,
        doctorId: f.doctor.id,
        startsAt: '2030-01-01T09:00:00+09:00',
      };
      expect(
        (
          await request(app)
            .post('/')
            .send({ ...payload, startsAt: '2030-01-01T09:00:00' })
        ).status,
      ).toBe(400);
      const result = await request(app).post('/').send(payload);
      expect(result.status).toBe(201);
      id = f.nurse.id;
      expect(
        (
          await request(app)
            .patch(`/${result.body.data.id}/time`)
            .send({ startsAt: '2030-01-01T09:20:00+09:00' })
        ).status,
      ).toBe(403);
      id = null;
      expect((await request(app).post('/').send(payload)).status).toBe(401);
    });
  });
});
