import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { getVisit } from './visit-query.service.js';
const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('진료 상세 조회', () => {
  it('담당 의사에게 접수 당시 진료과·환자·진료 상태를 반환하고 타 의사를 차단한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const rec = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      const visit = await tx.visit.create({ data: { receptionId: rec.id } });
      await tx.doctor.update({
        where: { accountId: f.doctor.id },
        data: { departmentId: f.otherDepartment.id },
      });
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const actor = {
        id: f.doctor.id,
        role: 'DOCTOR' as const,
        status: 'ACTIVE' as const,
        departmentId: f.otherDepartment.id,
      };
      const data = await getVisit(actor, visit.id);
      expect(data).toMatchObject({
        id: visit.id,
        receptionId: rec.id,
        department: { id: f.department.id },
        doctor: { id: f.doctor.id, department: { id: f.otherDepartment.id } },
        status: 'IN_PROGRESS',
      });
      expect((data as { patient: unknown }).patient).not.toHaveProperty('patientNumber');
      await expect(getVisit({ ...actor, id: 'another-doctor' }, visit.id)).rejects.toMatchObject({
        status: 403,
      });
      await expect(getVisit({ ...actor, role: 'STAFF' }, visit.id)).rejects.toMatchObject({
        status: 403,
      });
      await expect(getVisit(actor, 'missing')).rejects.toMatchObject({ status: 404 });
    });
  });
});
