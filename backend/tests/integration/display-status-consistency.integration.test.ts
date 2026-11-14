import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../src/config/prisma.js';
import type { AccountContext } from '../../src/common/middlewares/auth.js';
import { errorHandler } from '../../src/common/errors/index.js';
import { appointmentRouter } from '../../src/modules/appointment/routes/appointment.routes.js';
import { receptionRouter } from '../../src/modules/reception/routes/reception.routes.js';
import { doctorPatientsRouter } from '../../src/modules/visit/routes/doctor-patients.routes.js';
import { doctorScheduleRouter } from '../../src/modules/dashboard/routes/doctor-schedule.routes.js';
import { staffDashboardRouter } from '../../src/modules/dashboard/routes/staff-dashboard.routes.js';
import { patientRouter } from '../../src/modules/patient/routes/patient.routes.js';
import { testDatabaseUrl } from '../../scripts/test-db-config.mjs';
import { createMedicalStaffFixture } from '../helpers/medical-staff-fixture.js';
import { withRollback } from '../helpers/transaction.js';

const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());

type PatientView = {
  id: string;
  name: string;
  birthDate: string;
  phone: string;
  patientNumber?: string;
};
type Row = {
  id?: string;
  appointmentId?: string | null;
  receptionId?: string | null;
  displayStatus: string;
  patient: PatientView;
};

describe('목록과 대시보드의 화면 상태·역할별 환자 정보', () => {
  it('동일 예약의 상태가 변경돼도 각 목록·필터·일정에 일치하고 환자번호는 직원에게만 표시된다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const staff: AccountContext = {
        id: f.admin.id,
        role: 'STAFF',
        status: 'ACTIVE',
        departmentId: null,
      };
      const nurse: AccountContext = {
        id: f.nurse.id,
        role: 'NURSE',
        status: 'ACTIVE',
        departmentId: f.department.id,
      };
      const doctor: AccountContext = {
        id: f.doctor.id,
        role: 'DOCTOR',
        status: 'ACTIVE',
        departmentId: f.department.id,
      };
      let actor = staff;
      const app = express();
      app.locals.accountProvider = async () => actor;
      app.use('/appointments', appointmentRouter);
      app.use('/receptions', receptionRouter);
      app.use('/doctors', doctorPatientsRouter, doctorScheduleRouter);
      app.use('/patients', patientRouter);
      app.use(staffDashboardRouter, errorHandler);
      const fields = {
        patientId: f.patient.id,
        doctorAccountId: f.doctor.id,
        departmentId: f.department.id,
      };
      const appointment = await tx.appointment.create({
        data: {
          ...fields,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2030-01-01T09:00:00+09:00'),
        },
      });
      const query = 'date=2030-01-01';
      const check = async (status: string, receptionId: string | null) => {
        for (const account of [staff, nurse]) {
          actor = account;
          const appointments = await request(app)
            .get(`/appointments?patientId=${f.patient.id}&status=${status}`)
            .expect(200);
          const row = appointments.body.data.find((item: Row) => item.id === appointment.id) as Row;
          expect(row.displayStatus).toBe(status);
          if (account.role === 'STAFF')
            expect(row.patient.patientNumber).toBe(f.patient.patientNumber);
          else expect(row.patient).not.toHaveProperty('patientNumber');
          const cancelled = await request(app)
            .get(`/appointments?patientId=${f.patient.id}&status=CANCELLED`)
            .expect(200);
          expect(cancelled.body.data).toEqual([]);
          if (receptionId) {
            const receptions = await request(app)
              .get(`/receptions?patientId=${f.patient.id}&status=${status}`)
              .expect(200);
            const reception = receptions.body.data.find(
              (item: Row) => item.id === receptionId,
            ) as Row;
            expect(reception.displayStatus).toBe(status);
            if (status !== 'REGISTERED') {
              const registered = await request(app)
                .get(`/receptions?patientId=${f.patient.id}&status=REGISTERED`)
                .expect(200);
              expect(registered.body.data).toEqual([]);
            }
            if (account.role === 'STAFF')
              expect(reception.patient.patientNumber).toBe(f.patient.patientNumber);
            else expect(reception.patient).not.toHaveProperty('patientNumber');
          }
        }
        actor = staff;
        const dashboard = await request(app).get(`/dashboards/staff?${query}`).expect(200);
        const preview = dashboard.body.data.appointmentPreview.find(
          (item: Row) => item.id === appointment.id,
        ) as Row;
        expect(preview.displayStatus).toBe(status);
        if (receptionId) {
          const reception = dashboard.body.data.receptionPreview.find(
            (item: Row) => item.id === receptionId,
          ) as Row;
          expect(reception.displayStatus).toBe(status);
        }
        actor = doctor;
        const patients = await request(app)
          .get(`/doctors/me/patients?${query}&status=${status}`)
          .expect(200);
        const patientRow = patients.body.data.find(
          (item: Row) => item.appointmentId === appointment.id,
        ) as Row;
        expect(patientRow.displayStatus).toBe(status);
        expect(patientRow.patient).not.toHaveProperty('patientNumber');
        const schedule = await request(app)
          .get('/doctors/me/schedule?from=2030-01-01&to=2030-01-01')
          .expect(200);
        const scheduled = schedule.body.data.appointments.find(
          (item: Row) => item.id === appointment.id,
        ) as Row;
        expect(scheduled.displayStatus).toBe(status);
        expect(scheduled.patient).not.toHaveProperty('patientNumber');
        if (receptionId) {
          const reception = schedule.body.data.receptions.find(
            (item: Row) => item.id === receptionId,
          ) as Row;
          expect(reception.displayStatus).toBe(status);
          expect(reception.patient).not.toHaveProperty('patientNumber');
        }
      };
      await check('BOOKED', null);
      const reception = await tx.reception.create({
        data: {
          ...fields,
          appointmentId: appointment.id,
          receivedAt: new Date('2030-01-01T09:10:00+09:00'),
        },
      });
      await check('REGISTERED', reception.id);
      await tx.reception.update({ where: { id: reception.id }, data: { status: 'CALLED' } });
      await check('CALLED', reception.id);
      const visit = await tx.visit.create({
        data: { receptionId: reception.id, startedAt: new Date('2030-01-01T09:15:00+09:00') },
      });
      await check('IN_PROGRESS', reception.id);
      await tx.visit.update({
        where: { id: visit.id },
        data: { status: 'COMPLETED', completedAt: new Date('2030-01-01T09:20:00+09:00') },
      });
      await check('COMPLETED', reception.id);
      actor = staff;
      const history = await request(app).get(`/patients/${f.patient.id}/visits`).expect(200);
      expect(history.body.data).toMatchObject([
        { visitId: visit.id, patientId: f.patient.id, displayStatus: 'COMPLETED' },
      ]);
      expect(history.body.data[0]).not.toHaveProperty('symptoms');
      actor = nurse;
      await request(app).get(`/patients/${f.patient.id}/visits`).expect(403);
      const nursePatients = await request(app)
        .get(`/patients?name=${encodeURIComponent(f.patient.name)}`)
        .expect(200);
      const nursePatient = nursePatients.body.data.find(
        (item: PatientView) => item.id === f.patient.id,
      ) as PatientView;
      expect(nursePatient).not.toHaveProperty('patientNumber');
      actor = staff;
      const staffPatients = await request(app)
        .get(`/patients?name=${encodeURIComponent(f.patient.name)}`)
        .expect(200);
      const staffPatient = staffPatients.body.data.find(
        (item: PatientView) => item.id === f.patient.id,
      ) as PatientView;
      expect(staffPatient.patientNumber).toBe(f.patient.patientNumber);
    });
  });
  it('취소 예약과 물리 삭제된 접수를 화면별 정책대로 표현하고 타과 간호사에게 숨긴다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const staff: AccountContext = {
        id: f.admin.id,
        role: 'STAFF',
        status: 'ACTIVE',
        departmentId: null,
      };
      const nurse: AccountContext = {
        id: f.nurse.id,
        role: 'NURSE',
        status: 'ACTIVE',
        departmentId: f.department.id,
      };
      const doctor: AccountContext = {
        id: f.doctor.id,
        role: 'DOCTOR',
        status: 'ACTIVE',
        departmentId: f.department.id,
      };
      const otherNurse = await tx.account.create({
        data: {
          name: '다른 과 간호사',
          email: `other-${f.admin.id}@example.test`,
          passwordHash: 'test',
          role: 'NURSE',
          nurse: { create: { departmentId: f.otherDepartment.id } },
        },
      });
      const other: AccountContext = {
        id: otherNurse.id,
        role: 'NURSE',
        status: 'ACTIVE',
        departmentId: f.otherDepartment.id,
      };
      let actor = staff;
      const app = express();
      app.locals.accountProvider = async () => actor;
      app.use('/appointments', appointmentRouter);
      app.use('/receptions', receptionRouter);
      app.use('/doctors', doctorPatientsRouter, doctorScheduleRouter);
      app.use(staffDashboardRouter, errorHandler);
      const fields = {
        patientId: f.patient.id,
        doctorAccountId: f.doctor.id,
        departmentId: f.department.id,
      };
      const cancelled = await tx.appointment.create({
        data: {
          ...fields,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2030-01-01T08:00:00+09:00'),
          status: 'CANCELLED',
          cancelledAt: new Date('2029-12-31T08:00:00Z'),
          cancelledByAccountId: f.admin.id,
        },
      });
      const booked = await tx.appointment.create({
        data: {
          ...fields,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2030-01-01T09:00:00+09:00'),
        },
      });
      const reception = await tx.reception.create({
        data: {
          ...fields,
          appointmentId: booked.id,
          receivedAt: new Date('2030-01-01T09:10:00+09:00'),
        },
      });
      for (const account of [staff, nurse]) {
        actor = account;
        const result = await request(app)
          .get(`/appointments?patientId=${f.patient.id}&status=CANCELLED`)
          .expect(200);
        expect(result.body.data).toMatchObject([{ id: cancelled.id, displayStatus: 'CANCELLED' }]);
      }
      actor = staff;
      const dashboard = await request(app).get('/dashboards/staff?date=2030-01-01').expect(200);
      expect(dashboard.body.data.appointmentPreview.map((row: Row) => row.id)).toEqual([booked.id]);
      actor = doctor;
      const patients = await request(app)
        .get('/doctors/me/patients?date=2030-01-01&status=CANCELLED')
        .expect(200);
      expect(patients.body.data).toMatchObject([
        { appointmentId: cancelled.id, displayStatus: 'CANCELLED' },
      ]);
      const schedule = await request(app)
        .get('/doctors/me/schedule?from=2030-01-01&to=2030-01-01')
        .expect(200);
      expect(
        schedule.body.data.appointments.find((row: Row) => row.id === cancelled.id),
      ).toMatchObject({ displayStatus: 'CANCELLED' });
      actor = other;
      const otherAppointments = await request(app)
        .get(`/appointments?patientId=${f.patient.id}`)
        .expect(200);
      const otherReceptions = await request(app)
        .get(`/receptions?patientId=${f.patient.id}`)
        .expect(200);
      expect(otherAppointments.body.data).toEqual([]);
      expect(otherReceptions.body.data).toEqual([]);
      await request(app).get(`/receptions/${reception.id}`).expect(403);
      await tx.reception.delete({ where: { id: reception.id } });
      actor = staff;
      const afterDelete = await request(app)
        .get(`/appointments?patientId=${f.patient.id}&status=BOOKED`)
        .expect(200);
      expect(afterDelete.body.data).toMatchObject([
        { id: booked.id, displayStatus: 'BOOKED', receptionId: null },
      ]);
      const deletedReceptions = await request(app)
        .get(`/receptions?patientId=${f.patient.id}`)
        .expect(200);
      expect(deletedReceptions.body.data).toEqual([]);
      actor = doctor;
      const afterPatients = await request(app)
        .get('/doctors/me/patients?date=2030-01-01&status=BOOKED')
        .expect(200);
      expect(afterPatients.body.data).toMatchObject([
        { appointmentId: booked.id, receptionId: null, displayStatus: 'BOOKED' },
      ]);
    });
  });
});
