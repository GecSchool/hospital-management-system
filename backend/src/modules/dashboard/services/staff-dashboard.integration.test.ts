import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { getStaffDashboard } from './staff-dashboard.service.js';
import { listAppointments } from '../../appointment/services/appointment-query.service.js';
import { parseAppointmentQuery } from '../../appointment/validations/appointment-query.validation.js';
import { parseStaffDashboardDate } from '../validations/staff-dashboard.validation.js';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../../common/errors/index.js';
import { staffDashboardRouter } from '../routes/staff-dashboard.routes.js';
const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('직원 대시보드', () => {
  it('HTTP에서 직원 권한과 입력을 검증하고 표준 응답을 반환한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const app = express();
      let actor: AccountContext | null = {
        id: f.admin.id,
        role: 'STAFF',
        status: 'ACTIVE',
        departmentId: null,
      };
      app.locals.accountProvider = async () => actor;
      app.use(staffDashboardRouter);
      app.use(errorHandler);
      const ok = await request(app).get('/dashboards/staff?date=2030-01-01').expect(200);
      expect(ok.body).toEqual({
        data: { date: '2030-01-01', receptionPreview: [], appointmentPreview: [] },
        meta: null,
      });
      await request(app).get('/dashboards/staff?date=bad').expect(400);
      actor = { ...actor, role: 'NURSE' };
      await request(app).get('/dashboards/staff').expect(403);
      actor = null;
      await request(app).get('/dashboards/staff').expect(401);
    });
  });
  it('서울 시간의 오늘을 기본 날짜로 사용하고 날짜 형식을 검증한다', () => {
    expect(parseStaffDashboardDate({}, new Date('2030-01-01T16:00:00Z'))).toBe('2030-01-02');
    expect(() => parseStaffDashboardDate({ date: '2030-02-30' })).toThrow();
    expect(() => parseStaffDashboardDate({ date: ['2030-01-01'] })).toThrow();
  });
  it('선택한 서울 날짜의 예약과 최근 접수 상태를 공통 형식으로 반환한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const actor: AccountContext = {
        id: f.admin.id,
        role: 'STAFF',
        status: 'ACTIVE',
        departmentId: null,
      };
      const fields = {
        patientId: f.patient.id,
        doctorAccountId: f.doctor.id,
        departmentId: f.department.id,
      };
      const appointment = await tx.appointment.create({
        data: {
          ...fields,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2030-01-01T01:00:00+09:00'),
        },
      });
      const old = await tx.reception.create({
        data: {
          ...fields,
          receivedAt: new Date('2030-01-01T01:00:00+09:00'),
          appointmentId: appointment.id,
        },
      });
      const recent = await tx.reception.create({
        data: { ...fields, receivedAt: new Date('2030-01-01T02:00:00+09:00') },
      });
      await tx.visit.create({ data: { receptionId: old.id } });
      await tx.reception.create({
        data: { ...fields, receivedAt: new Date('2029-12-31T23:59:59+09:00') },
      });
      const result = (await getStaffDashboard(actor, '2030-01-01')) as any;
      expect(result.date).toBe('2030-01-01');
      expect(result.receptionPreview.map((r: any) => r.id)).toEqual([recent.id, old.id]);
      expect(result.receptionPreview[1].displayStatus).toBe('IN_PROGRESS');
      expect(result.appointmentPreview[0].displayStatus).toBe('IN_PROGRESS');
      expect(result.appointmentPreview[0].patient.patientNumber).toBe(f.patient.patientNumber);
      await expect(
        getStaffDashboard({ ...actor, role: 'NURSE' }, '2030-01-01'),
      ).rejects.toMatchObject({ status: 403 });
    });
  });
  it('접수는 최근 4건, 예약은 빠른 시각의 3건까지만 미리보기로 반환한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const actor: AccountContext = {
        id: f.admin.id,
        role: 'STAFF',
        status: 'ACTIVE',
        departmentId: null,
      };
      const fields = {
        patientId: f.patient.id,
        doctorAccountId: f.doctor.id,
        departmentId: f.department.id,
      };
      const receptionIds: string[] = [];
      const appointmentIds: string[] = [];
      for (let i = 0; i < 6; i++) {
        const at = new Date(Date.parse('2030-01-01T09:00:00+09:00') + i * 20 * 60 * 1000);
        const appointment = await tx.appointment.create({
          data: { ...fields, registeredByAccountId: f.admin.id, startsAt: at },
        });
        appointmentIds.push(appointment.id);
        const reception = await tx.reception.create({ data: { ...fields, receivedAt: at } });
        receptionIds.push(reception.id);
      }
      // 취소 예약은 가장 이른 시각이라도 미리보기 3자리를 차지하지 않는다.
      const cancelled = await tx.appointment.create({
        data: {
          ...fields,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2030-01-01T08:00:00+09:00'),
          status: 'CANCELLED',
          cancelledAt: new Date('2029-12-31T15:00:00Z'),
          cancelledByAccountId: f.admin.id,
        },
      });
      // 서울 날짜의 양 끝 경계 밖 예약은 포함하지 않는다.
      for (const startsAt of ['2029-12-31T23:59:59+09:00', '2030-01-02T00:00:00+09:00']) {
        await tx.appointment.create({
          data: { ...fields, registeredByAccountId: f.admin.id, startsAt: new Date(startsAt) },
        });
      }
      const result = await getStaffDashboard(actor, '2030-01-01');
      expect(result.receptionPreview.map((row) => row.id)).toEqual(
        receptionIds.slice(-4).reverse(),
      );
      expect(result.appointmentPreview.map((row) => row.id)).toEqual(appointmentIds.slice(0, 3));
      const allAppointments = await listAppointments(
        actor,
        parseAppointmentQuery({ date: '2030-01-01' }),
      );
      expect(allAppointments.data.map((row) => row.id)).toContain(cancelled.id);
    });
  });
});
