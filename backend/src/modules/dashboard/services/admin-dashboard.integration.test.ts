import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { getAdminDashboard } from './admin-dashboard.service.js';
const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('관리자 대시보드', () => {
  it('활성 계정만 역할별로 세고 진료과는 활성·비활성 별도 집계한다', async () => {
    await withRollback(prisma, async (tx) => {
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const actor = {
        id: 'admin',
        role: 'ADMIN' as const,
        status: 'ACTIVE' as const,
        departmentId: null,
      };
      const before = await getAdminDashboard(actor);
      const f = await createMedicalStaffFixture(tx);
      await tx.account.update({ where: { id: f.nurse.id }, data: { status: 'INACTIVE' } });
      const after = await getAdminDashboard(actor);
      expect(after.accountsByRole.ADMIN).toBe(before.accountsByRole.ADMIN + 1);
      expect(after.accountsByRole.DOCTOR).toBe(before.accountsByRole.DOCTOR + 1);
      expect(after.accountsByRole.NURSE).toBe(before.accountsByRole.NURSE);
      expect(after.accountsByRole.STAFF).toBe(before.accountsByRole.STAFF);
      expect(after.departmentsByStatus.ACTIVE).toBe(before.departmentsByStatus.ACTIVE + 2);
      expect(after.departmentsByStatus.INACTIVE).toBe(before.departmentsByStatus.INACTIVE + 1);
      await expect(getAdminDashboard({ ...actor, role: 'STAFF' })).rejects.toMatchObject({
        status: 403,
      });
    });
  });
});
