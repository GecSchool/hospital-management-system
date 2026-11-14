import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { getAppointment, listAppointments } from './appointment-query.service.js';
import { parseAppointmentQuery } from '../validations/appointment-query.validation.js';
import type { AccountContext } from '../../../common/middlewares/auth.js';

const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('예약 목록·상세', () => {
  it('상태 필터와 응답이 접수 및 진료 상태와 일치하고 한국 날짜 경계를 지킨다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const base = {
        patientId: f.patient.id,
        doctorAccountId: f.doctor.id,
        departmentId: f.department.id,
        registeredByAccountId: f.admin.id,
      };
      const initial = new Date('2030-01-01T00:00:00+09:00').getTime();
      for (let i = 0; i < 6; i++) {
        const a = await tx.appointment.create({
          data: {
            ...base,
            startsAt: new Date(initial + i * 1200000),
            ...(i === 1 && {
              status: 'CANCELLED',
              cancelledAt: new Date(),
              cancelledByAccountId: f.admin.id,
            }),
          },
        });
        if (i >= 2) {
          const reception = await tx.reception.create({
            data: {
              patientId: f.patient.id,
              doctorAccountId: f.doctor.id,
              departmentId: f.department.id,
              appointmentId: a.id,
              status: i >= 3 ? 'CALLED' : 'REGISTERED',
            },
          });
          if (i >= 4)
            await tx.visit.create({
              data: {
                receptionId: reception.id,
                status: i === 5 ? 'COMPLETED' : 'IN_PROGRESS',
                startedAt: new Date('2026-01-01T00:00:00Z'),
                ...(i === 5 && { completedAt: new Date('2026-01-01T00:20:00Z') }),
              },
            });
        }
      }
      await tx.appointment.create({ data: { ...base, startsAt: new Date(initial - 1200000) } });
      const actor: AccountContext = {
        id: f.admin.id,
        role: 'STAFF',
        status: 'ACTIVE',
        departmentId: null,
      };
      for (const status of [
        'BOOKED',
        'CANCELLED',
        'REGISTERED',
        'CALLED',
        'IN_PROGRESS',
        'COMPLETED',
      ]) {
        const result = await listAppointments(
          actor,
          parseAppointmentQuery({ date: '2030-01-01', status }),
        );
        expect(result.meta.totalItems).toBe(1);
        expect(result.data[0].displayStatus).toBe(status);
        expect(result.data[0].patient.patientNumber).toBe(f.patient.patientNumber);
      }
      const page = await listAppointments(
        actor,
        parseAppointmentQuery({ date: '2030-01-01', page: '2', size: '2' }),
      );
      expect(page.data).toHaveLength(2);
      expect(page.meta).toEqual({ page: 2, size: 2, totalItems: 6, totalPages: 3 });
    });
  });
  it('간호사는 같은 과만, 의사는 본인 예약만 조회한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const a = await tx.appointment.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2030-01-01T00:00:00Z'),
        },
      });
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
      expect((await getAppointment(nurse, a.id)).patient).not.toHaveProperty('patientNumber');
      expect((await getAppointment(doctor, a.id)).id).toBe(a.id);
      const wrongDept = { ...nurse, departmentId: f.otherDepartment.id };
      await expect(getAppointment(wrongDept, a.id)).rejects.toMatchObject({ status: 403 });
      expect(
        (await listAppointments(wrongDept, parseAppointmentQuery({ patientId: f.patient.id })))
          .data,
      ).toHaveLength(0);
      await expect(getAppointment({ ...doctor, id: 'other' }, a.id)).rejects.toMatchObject({
        status: 403,
      });
      await expect(listAppointments(doctor, parseAppointmentQuery({}))).rejects.toMatchObject({
        status: 403,
      });
    });
  });
});
