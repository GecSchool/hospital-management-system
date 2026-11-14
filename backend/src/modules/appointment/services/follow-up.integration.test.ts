import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { createFollowUp } from './follow-up.service.js';
const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('완료 진료의 재진 예약', () => {
  it('담당 의사·완료 상태·예약 가능 여부를 확인하고 진료의 환자와 과로 생성한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      await tx.doctorAvailability.createMany({
        data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          doctorAccountId: f.doctor.id,
          dayOfWeek,
          startMinute: 0,
          endMinute: 1440,
        })),
      });
      const rec = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      const visit = await tx.visit.create({ data: { receptionId: rec.id, status: 'IN_PROGRESS' } });
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
        id: f.doctor.id,
        role: 'DOCTOR' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      const time = new Date('2030-01-01T00:00:00Z');
      await expect(createFollowUp(actor, visit.id, time)).rejects.toMatchObject({ status: 409 });
      await tx.visit.update({
        where: { id: visit.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      await expect(createFollowUp({ ...actor, id: 'other' }, visit.id, time)).rejects.toMatchObject(
        { status: 403 },
      );
      const result = await createFollowUp(actor, visit.id, time);
      expect(result).toMatchObject({
        patient: { id: f.patient.id },
        department: { id: f.department.id },
        doctor: { id: f.doctor.id },
        registeredBy: { id: f.doctor.id },
      });
      await expect(createFollowUp(actor, visit.id, time)).rejects.toMatchObject({
        status: 409,
        code: 'SLOT_UNAVAILABLE',
      });
      await tx.doctor.update({
        where: { accountId: f.doctor.id },
        data: { departmentId: f.otherDepartment.id },
      });
      await expect(
        createFollowUp(actor, visit.id, new Date('2030-01-01T00:20:00Z')),
      ).rejects.toMatchObject({ status: 409, code: 'SLOT_UNAVAILABLE' });
      await tx.doctor.update({
        where: { accountId: f.doctor.id },
        data: { departmentId: f.department.id },
      });
      await tx.department.update({ where: { id: f.department.id }, data: { status: 'INACTIVE' } });
      await expect(
        createFollowUp(actor, visit.id, new Date('2030-01-01T00:20:00Z')),
      ).rejects.toMatchObject({ status: 409, code: 'SLOT_UNAVAILABLE' });
    });
  });
});
