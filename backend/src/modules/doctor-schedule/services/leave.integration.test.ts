import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { listLeaves, createLeave } from './leave.service.js';
import { parseLeaveRange, parseLeaveRequest } from '../validations/leave.validation.js';
import { lockDoctorWork } from '../../medical-staff/services/doctor-work-lock.js';
import express from 'express';
import request from 'supertest';
import { createAccountProvider } from '../../../common/middlewares/account-provider.js';
import { errorHandler } from '../../../common/errors/index.js';
import { leaveRouter } from '../routes/leave.routes.js';

const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());

describe('휴진 조회·등록', () => {
  it('날짜 범위와 입력 날짜를 검증한다', () => {
    expect(parseLeaveRange({ from: '2030-01-01', to: '2030-01-31' })).toEqual({
      from: '2030-01-01',
      to: '2030-01-31',
    });
    expect(() => parseLeaveRange({ from: '2030-02-30', to: '2030-03-01' })).toThrow();
    expect(() => parseLeaveRange({ from: '2030-03-02', to: '2030-03-01' })).toThrow();
    expect(() => parseLeaveRequest({ date: '2030-02-30' })).toThrow();
    expect(() =>
      parseLeaveRequest({ date: '2026-11-13' }, new Date('2026-11-13T15:00:00Z')),
    ).toThrow();
    expect(parseLeaveRequest({ date: '2026-11-14' }, new Date('2026-11-13T15:00:00Z'))).toBe(
      '2026-11-14',
    );
  });

  it('본인의 휴진을 생성하고 해당 날짜 범위를 포함하여 조회한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        new Proxy(tx, {
          get(target, key, receiver) {
            if (key === '$transaction')
              return async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx);
            return Reflect.get(target, key, receiver);
          },
        }) as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const doctor = {
        id: f.doctor.id,
        role: 'DOCTOR' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      expect(await createLeave(doctor, '2030-01-02')).toEqual({ date: '2030-01-02' });
      expect(await listLeaves(doctor, f.doctor.id, '2030-01-02', '2030-01-02')).toEqual([
        { date: '2030-01-02' },
      ]);
      await expect(createLeave(doctor, '2030-01-02')).rejects.toMatchObject({ status: 409 });
      const nurse = {
        id: f.nurse.id,
        role: 'NURSE' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      expect(await listLeaves(nurse, f.doctor.id, '2030-01-01', '2030-01-31')).toHaveLength(1);
      await expect(
        listLeaves(
          { ...nurse, departmentId: f.otherDepartment.id },
          f.doctor.id,
          '2030-01-01',
          '2030-01-31',
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        listLeaves({ ...doctor, id: f.admin.id }, f.doctor.id, '2030-01-01', '2030-01-31'),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  it('서울 날짜 경계에 있는 유효 예약은 휴진을 막고 취소 예약은 막지 않는다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        new Proxy(tx, {
          get(target, key, receiver) {
            if (key === '$transaction')
              return async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx);
            return Reflect.get(target, key, receiver);
          },
        }) as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const doctor = {
        id: f.doctor.id,
        role: 'DOCTOR' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      const appointment = await tx.appointment.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2030-01-01T15:00:00Z'),
        },
      });
      await expect(createLeave(doctor, '2030-01-02')).rejects.toMatchObject({
        status: 409,
        code: 'LEAVE_HAS_BOOKING',
      });
      await tx.appointment.update({
        where: { id: appointment.id },
        data: { status: 'CANCELLED', cancelledByAccountId: f.admin.id, cancelledAt: new Date() },
      });
      expect(await createLeave(doctor, '2030-01-02')).toEqual({ date: '2030-01-02' });
    });
  });

  it('HTTP 경로에서 인증·역할·날짜와 정상 응답을 확인한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      let id: string | null = f.doctor.id;
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        new Proxy(tx, {
          get(target, key, receiver) {
            if (key === '$transaction')
              return async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx);
            return Reflect.get(target, key, receiver);
          },
        }) as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const app = express();
      app.locals.accountProvider = createAccountProvider(
        async () => id,
        () => tx,
      );
      app.use(express.json(), leaveRouter, errorHandler);
      expect(
        (await request(app).post('/doctors/me/leaves').send({ date: '2030-02-30' })).status,
      ).toBe(400);
      expect(
        (await request(app).post('/doctors/me/leaves').send({ date: '2030-01-05' })).body.data,
      ).toEqual({ date: '2030-01-05' });
      expect(
        (
          await request(app)
            .get(`/doctors/${f.doctor.id}/leaves`)
            .query({ from: '2030-01-01', to: '2030-01-31' })
        ).body.data,
      ).toEqual([{ date: '2030-01-05' }]);
      id = f.nurse.id;
      expect(
        (await request(app).post('/doctors/me/leaves').send({ date: '2030-01-06' })).status,
      ).toBe(403);
      id = null;
      expect(
        (
          await request(app)
            .get(`/doctors/${f.doctor.id}/leaves`)
            .query({ from: '2030-01-01', to: '2030-01-31' })
        ).status,
      ).toBe(401);
    });
  });

  it('의사 잠금을 먼저 보유한 예약이 저장되면 동시 휴진 신청은 거부한다', async () => {
    const f = await createMedicalStaffFixture(prisma);
    const doctor = {
      id: f.doctor.id,
      role: 'DOCTOR' as const,
      status: 'ACTIVE' as const,
      departmentId: f.department.id,
    };
    let release!: () => void, locked!: () => void;
    const untilRelease = new Promise<void>((resolve) => {
      release = resolve;
    });
    const acquired = new Promise<void>((resolve) => {
      locked = resolve;
    });
    vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(prisma);
    try {
      const booking = prisma.$transaction(async (tx) => {
        await lockDoctorWork(tx, f.doctor.id);
        await tx.appointment.create({
          data: {
            patientId: f.patient.id,
            doctorAccountId: f.doctor.id,
            departmentId: f.department.id,
            registeredByAccountId: f.admin.id,
            startsAt: new Date('2030-01-01T15:00:00Z'),
          },
        });
        locked();
        await untilRelease;
      });
      await acquired;
      const result = expect(createLeave(doctor, '2030-01-02')).rejects.toMatchObject({
        code: 'LEAVE_HAS_BOOKING',
      });
      release();
      await booking;
      await result;
      expect(
        await prisma.doctorLeave.findUnique({
          where: {
            doctorAccountId_date: {
              doctorAccountId: f.doctor.id,
              date: new Date('2030-01-02T00:00:00Z'),
            },
          },
        }),
      ).toBeNull();
    } finally {
      release();
      await prisma.appointment.deleteMany({ where: { doctorAccountId: f.doctor.id } });
      await prisma.doctorLeave.deleteMany({ where: { doctorAccountId: f.doctor.id } });
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
