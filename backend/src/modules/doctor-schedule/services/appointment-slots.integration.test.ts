import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { getAppointmentSlots, isAppointmentSlotAvailable } from './appointment-slots.service.js';

const prisma = db.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
const staff = (id: string) => ({
  id,
  role: 'STAFF' as const,
  status: 'ACTIVE' as const,
  departmentId: null,
});
describe('예약 가능 시간', () => {
  it('근무·휴진·20분 경계·유효 예약을 사용하여 가능 여부를 검사한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      await tx.doctorAvailability.create({
        data: { doctorAccountId: f.doctor.id, dayOfWeek: 0, startMinute: 540, endMinute: 600 },
      });
      const now = new Date('2029-01-01T00:00:00Z'),
        nine = new Date('2030-01-06T00:00:00Z');
      expect(await isAppointmentSlotAvailable(tx, f.doctor.id, nine, { now })).toBe(true);
      expect(
        await isAppointmentSlotAvailable(tx, f.doctor.id, new Date('2030-01-06T00:10:00Z'), {
          now,
        }),
      ).toBe(false);
      expect(
        await isAppointmentSlotAvailable(tx, f.doctor.id, new Date('2030-01-06T01:00:00Z'), {
          now,
        }),
      ).toBe(false);
      expect(
        await isAppointmentSlotAvailable(tx, f.doctor.id, nine, {
          now: new Date('2031-01-01T00:00:00Z'),
        }),
      ).toBe(false);
      await tx.appointment.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          registeredByAccountId: f.admin.id,
          startsAt: nine,
        },
      });
      expect(await isAppointmentSlotAvailable(tx, f.doctor.id, nine, { now })).toBe(false);
      await tx.doctorLeave.create({
        data: { doctorAccountId: f.doctor.id, date: new Date('2030-01-06T00:00:00Z') },
      });
      expect(
        await isAppointmentSlotAvailable(tx, f.doctor.id, new Date('2030-01-06T00:20:00Z'), {
          now,
        }),
      ).toBe(false);
    });
  });
  it('예약된 칸을 비활성화하며 변경할 예약 하나만 제외한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      await tx.doctorAvailability.create({
        data: { doctorAccountId: f.doctor.id, dayOfWeek: 0, startMinute: 540, endMinute: 600 },
      });
      const appt = await tx.appointment.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2030-01-06T00:00:00Z'),
        },
      });
      vi.spyOn(db, 'getPrismaClient').mockReturnValue(tx as ReturnType<typeof db.getPrismaClient>);
      const slots = await getAppointmentSlots(f.doctor.id, '2030-01-06', staff(f.admin.id));
      expect(slots.slots).toHaveLength(72);
      expect(slots.slots[0].startsAt).toBe('2030-01-06T00:00:00+09:00');
      expect(slots.slots[71].startsAt).toBe('2030-01-06T23:40:00+09:00');
      expect(slots.slots.every((s) => !('reason' in s))).toBe(true);
      expect(slots.slots.find((s) => s.startsAt === '2030-01-06T09:00:00+09:00')?.available).toBe(
        false,
      );
      expect(slots.slots.find((s) => s.startsAt === '2030-01-06T09:20:00+09:00')?.available).toBe(
        true,
      );
      const excluded = await getAppointmentSlots(
        f.doctor.id,
        '2030-01-06',
        staff(f.admin.id),
        appt.id,
      );
      expect(
        excluded.slots.find((s) => s.startsAt === '2030-01-06T09:00:00+09:00')?.available,
      ).toBe(true);
      await expect(
        getAppointmentSlots(
          f.doctor.id,
          '2030-01-06',
          { id: f.nurse.id, role: 'NURSE', status: 'ACTIVE', departmentId: f.department.id },
          appt.id,
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        getAppointmentSlots(f.doctor.id, '2030-01-06', {
          id: f.nurse.id,
          role: 'NURSE',
          status: 'ACTIVE',
          departmentId: f.otherDepartment.id,
        }),
      ).rejects.toMatchObject({ status: 403 });
      await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          appointmentId: appt.id,
        },
      });
      await expect(
        getAppointmentSlots(f.doctor.id, '2030-01-06', staff(f.admin.id), appt.id),
      ).rejects.toMatchObject({ status: 409, code: 'APPOINTMENT_ALREADY_RECEIVED' });
    });
  });
  it('취소된 예약이나 다른 의사 예약은 제외할 수 없다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const cancelled = await tx.appointment.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2030-01-06T00:00:00Z'),
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledByAccountId: f.admin.id,
        },
      });
      const other = await tx.account.create({
        data: {
          name: '다른 의사',
          email: `other-${f.admin.id}@example.test`,
          passwordHash: 'test',
          role: 'DOCTOR',
          doctor: { create: { departmentId: f.department.id } },
        },
      });
      const otherAppointment = await tx.appointment.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: other.id,
          departmentId: f.department.id,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2030-01-06T00:00:00Z'),
        },
      });
      vi.spyOn(db, 'getPrismaClient').mockReturnValue(tx as ReturnType<typeof db.getPrismaClient>);
      await expect(
        getAppointmentSlots(f.doctor.id, '2030-01-06', staff(f.admin.id), cancelled.id),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        getAppointmentSlots(f.doctor.id, '2030-01-06', staff(f.admin.id), otherAppointment.id),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
  it('비활성 의사 또는 진료과의 예약을 허용하지 않는다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx),
        date = new Date('2030-01-06T00:00:00Z'),
        now = new Date('2029-01-01T00:00:00Z');
      await tx.doctorAvailability.create({
        data: { doctorAccountId: f.doctor.id, dayOfWeek: 0, startMinute: 540, endMinute: 600 },
      });
      await tx.account.update({ where: { id: f.doctor.id }, data: { status: 'INACTIVE' } });
      expect(await isAppointmentSlotAvailable(tx, f.doctor.id, date, { now })).toBe(false);
      await tx.account.update({ where: { id: f.doctor.id }, data: { status: 'ACTIVE' } });
      await tx.department.update({ where: { id: f.department.id }, data: { status: 'INACTIVE' } });
      expect(await isAppointmentSlotAvailable(tx, f.doctor.id, date, { now })).toBe(false);
    });
  });
});
