import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as prismaConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { getAvailability, replaceAvailability } from './availability.service.js';

const prisma = prismaConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
const actor = (
  id: string,
  role: 'DOCTOR' | 'STAFF' | 'NURSE' | 'ADMIN',
  departmentId: string | null,
) => ({ id, role, status: 'ACTIVE' as const, departmentId });
describe('진료 가능 시간 서비스', () => {
  it('정렬·병합한 시간표를 조회하고 의사 본인과 간호사의 과 범위를 확인한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      await tx.doctorAvailability.createMany({
        data: [
          { doctorAccountId: f.doctor.id, dayOfWeek: 1, startMinute: 600, endMinute: 720 },
          { doctorAccountId: f.doctor.id, dayOfWeek: 1, startMinute: 540, endMinute: 600 },
        ],
      });
      vi.spyOn(prismaConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof prismaConfig.getPrismaClient>,
      );
      const response = await getAvailability(
        f.doctor.id,
        actor(f.nurse.id, 'NURSE', f.department.id),
      );
      expect(response).toEqual({
        doctorId: f.doctor.id,
        intervalMinutes: 20,
        weeklySlots: [{ dayOfWeek: 1, startTime: '09:00', endTime: '12:00' }],
      });
      await expect(
        getAvailability(f.doctor.id, actor(f.nurse.id, 'NURSE', f.otherDepartment.id)),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        getAvailability(f.doctor.id, actor('other', 'DOCTOR', f.department.id)),
      ).rejects.toMatchObject({ status: 403 });
    });
  });
  it('미래 유효 예약과 충돌하면 기존 시간표를 유지하며, 예약 수용 시 교체한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      await tx.doctorAvailability.create({
        data: { doctorAccountId: f.doctor.id, dayOfWeek: 0, startMinute: 540, endMinute: 600 },
      });
      await tx.appointment.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2030-01-06T00:00:00Z'),
        },
      });
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
      await expect(replaceAvailability(f.doctor.id, [])).rejects.toMatchObject({
        status: 409,
        code: 'AVAILABILITY_CONFLICT',
      });
      expect(await tx.doctorAvailability.count({ where: { doctorAccountId: f.doctor.id } })).toBe(
        1,
      );
      const result = await replaceAvailability(f.doctor.id, [
        { dayOfWeek: 0, startMinute: 540, endMinute: 560 },
      ]);
      expect(result.weeklySlots).toEqual([{ dayOfWeek: 0, startTime: '09:00', endTime: '09:20' }]);
    });
  });
  it('과거 예약과 취소된 미래 예약은 시간표 제거를 막지 않는다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      await tx.doctorAvailability.create({
        data: { doctorAccountId: f.doctor.id, dayOfWeek: 0, startMinute: 540, endMinute: 600 },
      });
      const base = {
        patientId: f.patient.id,
        doctorAccountId: f.doctor.id,
        departmentId: f.department.id,
        registeredByAccountId: f.admin.id,
      };
      await tx.appointment.create({
        data: { ...base, startsAt: new Date('2020-01-06T00:00:00Z') },
      });
      await tx.appointment.create({
        data: {
          ...base,
          startsAt: new Date('2030-01-06T00:00:00Z'),
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledByAccountId: f.admin.id,
        },
      });
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
      expect((await replaceAvailability(f.doctor.id, [])).weeklySlots).toEqual([]);
      expect(await tx.doctorAvailability.count({ where: { doctorAccountId: f.doctor.id } })).toBe(
        0,
      );
    });
  });
  it('시간표 저장 시 DB에서 계정이 비활성화되었으면 저장하지 않는다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      await tx.account.update({ where: { id: f.doctor.id }, data: { status: 'INACTIVE' } });
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
      await expect(
        replaceAvailability(f.doctor.id, [{ dayOfWeek: 1, startMinute: 540, endMinute: 600 }]),
      ).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_INACTIVE' });
      expect(await tx.doctorAvailability.count({ where: { doctorAccountId: f.doctor.id } })).toBe(
        0,
      );
    });
  });
});
