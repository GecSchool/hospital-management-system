import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { hasPendingDoctorWork } from './doctor-work.service.js';

const prisma = createPrismaClient(testDatabaseUrl());
const now = new Date('2026-11-13T06:00:00Z');
afterAll(async () => {
  await prisma.$disconnect();
});

describe('의사의 미처리 업무 확인', () => {
  it('서울 기준 오늘 이후의 미접수 유효 예약은 미처리 업무다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      await tx.appointment.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2026-11-12T15:00:00Z'),
        },
      });
      expect(await hasPendingDoctorWork(tx, f.doctor.id, now)).toBe(true);
    });
  });

  it('과거 미접수 예약과 취소 예약은 차단하지 않는다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const base = {
        patientId: f.patient.id,
        doctorAccountId: f.doctor.id,
        departmentId: f.department.id,
        registeredByAccountId: f.admin.id,
      };
      await tx.appointment.create({
        data: { ...base, startsAt: new Date('2026-11-12T14:59:00Z') },
      });
      await tx.appointment.create({
        data: {
          ...base,
          startsAt: new Date('2026-11-14T00:00:00Z'),
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledByAccountId: f.admin.id,
        },
      });
      expect(await hasPendingDoctorWork(tx, f.doctor.id, now)).toBe(false);
    });
  });

  it('아직 진료가 시작되지 않은 접수와 진료 중인 접수는 날짜에 관계없이 차단한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const reception = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          receivedAt: new Date('2026-10-01T00:00:00Z'),
        },
      });
      expect(await hasPendingDoctorWork(tx, f.doctor.id, now)).toBe(true);
      await tx.visit.create({ data: { receptionId: reception.id, status: 'IN_PROGRESS' } });
      expect(await hasPendingDoctorWork(tx, f.doctor.id, now)).toBe(true);
    });
  });

  it('완료된 진료의 접수와 연결 예약은 차단하지 않는다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const appointment = await tx.appointment.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2026-11-14T00:00:00Z'),
        },
      });
      const reception = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          appointmentId: appointment.id,
        },
      });
      const timestamp = new Date('2026-11-13T00:00:00Z');
      await tx.visit.create({
        data: {
          receptionId: reception.id,
          status: 'COMPLETED',
          startedAt: timestamp,
          completedAt: timestamp,
        },
      });
      expect(await hasPendingDoctorWork(tx, f.doctor.id, now)).toBe(false);
    });
  });
});
