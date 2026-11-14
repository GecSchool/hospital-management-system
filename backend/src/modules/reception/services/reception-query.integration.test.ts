import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { getReception, listReceptions } from './reception-query.service.js';
import { parseReceptionQuery } from '../validations/reception-query.validation.js';
import type { AccountContext } from '../../../common/middlewares/auth.js';
const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('접수 목록 및 상세 조회', () => {
  it('화면 상태·페이지·한국 시간 날짜를 함께 적용한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const start = new Date('2030-01-01T00:00:00+09:00').getTime();
      const base = {
        patientId: f.patient.id,
        doctorAccountId: f.doctor.id,
        departmentId: f.department.id,
      };
      for (let i = 0; i < 4; i++) {
        const rec = await tx.reception.create({
          data: {
            ...base,
            receivedAt: new Date(start + i * 60000),
            status: i ? 'CALLED' : 'REGISTERED',
          },
        });
        if (i >= 2)
          await tx.visit.create({
            data: {
              receptionId: rec.id,
              status: i === 3 ? 'COMPLETED' : 'IN_PROGRESS',
              startedAt: new Date(start + (i === 2 ? 4 : 3) * 60000),
              ...(i === 3 && { completedAt: new Date(start + 210000) }),
            },
          });
      }
      await tx.reception.create({ data: { ...base, receivedAt: new Date(start - 60000) } });
      const actor: AccountContext = {
        id: f.admin.id,
        role: 'STAFF',
        status: 'ACTIVE',
        departmentId: null,
      };
      for (const status of ['REGISTERED', 'CALLED', 'IN_PROGRESS', 'COMPLETED']) {
        const result = await listReceptions(
          actor,
          parseReceptionQuery({ date: '2030-01-01', status }),
        );
        expect(result.meta.totalItems).toBe(1);
        expect(result.data[0].displayStatus).toBe(status);
        expect(result.data[0].patient.patientNumber).toBe(f.patient.patientNumber);
      }
      const page = await listReceptions(
        actor,
        parseReceptionQuery({ date: '2030-01-01', patientId: f.patient.id, page: '2', size: '2' }),
      );
      expect(page.data).toHaveLength(2);
      expect(page.meta).toEqual({ page: 2, size: 2, totalItems: 4, totalPages: 2 });
    });
  });
  it('간호사는 본인 과, 의사는 담당 접수만 상세 접근한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const rec = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
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
      expect((await getReception(nurse, rec.id)).patient).not.toHaveProperty('patientNumber');
      expect((await getReception(doctor, rec.id)).id).toBe(rec.id);
      const other = { ...nurse, departmentId: f.otherDepartment.id };
      await expect(getReception(other, rec.id)).rejects.toMatchObject({ status: 403 });
      expect(
        (await listReceptions(other, parseReceptionQuery({ patientId: f.patient.id }))).data,
      ).toHaveLength(0);
      await expect(getReception({ ...doctor, id: 'other' }, rec.id)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        listReceptions(doctor, parseReceptionQuery({ patientId: f.patient.id })),
      ).rejects.toMatchObject({ status: 403 });
    });
  });
});
