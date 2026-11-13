import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as prismaConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { changeDepartment } from '../../medical-staff/services/medical-staff.service.js';
import { changeAccountStatus } from './account-status.service.js';

const prisma = prismaConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());

describe('관리자의 계정 및 소속 변경', () => {
  it('의료진의 진료과를 변경하고 이력의 진료과는 유지한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const reception = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          visit: {
            create: { status: 'COMPLETED', startedAt: new Date(), completedAt: new Date() },
          },
        },
      });
      vi.spyOn(prismaConfig, 'getPrismaClient').mockReturnValue({
        $transaction: async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx),
      } as ReturnType<typeof prismaConfig.getPrismaClient>);
      const result = await changeDepartment(f.admin.id, f.doctor.id, f.otherDepartment.id);
      expect(result.department?.id).toBe(f.otherDepartment.id);
      expect(
        (await tx.reception.findUniqueOrThrow({ where: { id: reception.id } })).departmentId,
      ).toBe(f.department.id);
    });
  });

  it('미처리 업무가 있는 의사의 소속 변경과 비활성화를 거부한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      vi.spyOn(prismaConfig, 'getPrismaClient').mockReturnValue({
        $transaction: async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx),
      } as ReturnType<typeof prismaConfig.getPrismaClient>);
      await expect(
        changeDepartment(f.admin.id, f.doctor.id, f.otherDepartment.id),
      ).rejects.toMatchObject({ status: 409, code: 'DOCTOR_HAS_PENDING_WORK' });
      await expect(changeAccountStatus(f.admin.id, f.doctor.id, 'INACTIVE')).rejects.toMatchObject({
        status: 409,
        code: 'DOCTOR_HAS_PENDING_WORK',
      });
    });
  });

  it('비활성 진료과로 변경할 수 없고 간호사는 활성 진료과로 변경할 수 있다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(prismaConfig, 'getPrismaClient').mockReturnValue({
        $transaction: async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx),
      } as ReturnType<typeof prismaConfig.getPrismaClient>);
      await expect(
        changeDepartment(f.admin.id, f.nurse.id, f.inactiveDepartment.id),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        (await changeDepartment(f.admin.id, f.nurse.id, f.otherDepartment.id)).department?.id,
      ).toBe(f.otherDepartment.id);
    });
  });
});
