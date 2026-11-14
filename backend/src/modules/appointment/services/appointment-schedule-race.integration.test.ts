import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { createAppointment } from './appointment.service.js';
import { createLeave } from '../../doctor-schedule/services/leave.service.js';
import { replaceAvailability } from '../../doctor-schedule/services/availability.service.js';

const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());

async function withFixture(
  run: (f: Awaited<ReturnType<typeof createMedicalStaffFixture>>, staffId: string) => Promise<void>,
) {
  const f = await createMedicalStaffFixture(prisma);
  let staffId: string | undefined;
  try {
    const staff = await prisma.account.create({
      data: {
        name: '동시성 직원',
        email: `staff-race-${f.admin.id}@example.test`,
        role: 'STAFF',
        passwordHash: 'test',
      },
    });
    staffId = staff.id;
    await prisma.doctorAvailability.createMany({
      data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        doctorAccountId: f.doctor.id,
        dayOfWeek,
        startMinute: 0,
        endMinute: 1440,
      })),
    });
    vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(prisma);
    await run(f, staffId);
  } finally {
    await prisma.appointment.deleteMany({ where: { doctorAccountId: f.doctor.id } });
    await prisma.doctorLeave.deleteMany({ where: { doctorAccountId: f.doctor.id } });
    await prisma.doctorAvailability.deleteMany({ where: { doctorAccountId: f.doctor.id } });
    await prisma.patient.delete({ where: { id: f.patient.id } });
    await prisma.nurse.delete({ where: { accountId: f.nurse.id } });
    await prisma.doctor.delete({ where: { accountId: f.doctor.id } });
    await prisma.account.deleteMany({
      where: { id: { in: [f.admin.id, f.nurse.id, f.doctor.id, ...(staffId ? [staffId] : [])] } },
    });
    await prisma.department.deleteMany({
      where: { id: { in: [f.department.id, f.otherDepartment.id, f.inactiveDepartment.id] } },
    });
  }
}

describe('예약과 의사 일정 변경의 실제 동시 요청', () => {
  it('예약과 같은 날짜 휴진이 동시에 요청되면 동시에 저장되지 않는다', async () => {
    await withFixture(async (f, staffId) => {
      const staff = {
        id: staffId,
        role: 'STAFF' as const,
        status: 'ACTIVE' as const,
        departmentId: null,
      };
      const doctor = {
        id: f.doctor.id,
        role: 'DOCTOR' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      const results = await Promise.allSettled([
        createAppointment(staff, {
          patientId: f.patient.id,
          doctorId: f.doctor.id,
          departmentId: f.department.id,
          startsAt: new Date('2035-01-01T09:00:00+09:00'),
        }),
        createLeave(doctor, '2035-01-01'),
      ]);
      expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      const failure = results.find((x) => x.status === 'rejected');
      expect(failure).toMatchObject({ status: 'rejected', reason: { status: 409 } });
      expect(['SLOT_UNAVAILABLE', 'LEAVE_HAS_BOOKING']).toContain(
        (failure as PromiseRejectedResult).reason.code,
      );
      const [booking, leave] = await Promise.all([
        prisma.appointment.count({ where: { doctorAccountId: f.doctor.id, status: 'BOOKED' } }),
        prisma.doctorLeave.count({ where: { doctorAccountId: f.doctor.id } }),
      ]);
      expect(booking + leave).toBe(1);
      expect(booking * leave).toBe(0);
    });
  });

  it('예약과 전체 시간표 제거가 동시에 요청되면 둘 다 성공하지 않는다', async () => {
    await withFixture(async (f, staffId) => {
      const staff = {
        id: staffId,
        role: 'STAFF' as const,
        status: 'ACTIVE' as const,
        departmentId: null,
      };
      const results = await Promise.allSettled([
        createAppointment(staff, {
          patientId: f.patient.id,
          doctorId: f.doctor.id,
          departmentId: f.department.id,
          startsAt: new Date('2035-01-01T09:00:00+09:00'),
        }),
        replaceAvailability(f.doctor.id, []),
      ]);
      expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((x) => x.status === 'rejected')).toMatchObject({
        status: 'rejected',
        reason: { status: 409 },
      });
      const failure = results.find((x) => x.status === 'rejected') as PromiseRejectedResult;
      expect(['SLOT_UNAVAILABLE', 'AVAILABILITY_CONFLICT']).toContain(failure.reason.code);
      const [booking, slots] = await Promise.all([
        prisma.appointment.count({ where: { doctorAccountId: f.doctor.id, status: 'BOOKED' } }),
        prisma.doctorAvailability.count({ where: { doctorAccountId: f.doctor.id } }),
      ]);
      expect(booking === 1 ? slots === 7 : slots === 0).toBe(true);
    });
  });
});
