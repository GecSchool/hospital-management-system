import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { listPatientVisits } from './patient-visits.service.js';
import express from 'express';
import request from 'supertest';
import { patientRouter } from '../routes/patient.routes.js';
import { errorHandler } from '../../../common/errors/index.js';
import type { AccountContext } from '../../../common/middlewares/auth.js';
const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('직원의 환자 진료 이력 조회', () => {
  it('완료 진료만 본문 없이 반환하고 페이지를 적용한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const actor: AccountContext = {
        id: f.admin.id,
        role: 'STAFF',
        status: 'ACTIVE',
        departmentId: null,
      };
      for (let i = 0; i < 3; i++) {
        const rec = await tx.reception.create({
          data: {
            patientId: f.patient.id,
            doctorAccountId: f.doctor.id,
            departmentId: f.department.id,
          },
        });
        await tx.visit.create({
          data: {
            receptionId: rec.id,
            status: i === 2 ? 'IN_PROGRESS' : 'COMPLETED',
            startedAt: new Date('2026-10-01T00:00:00Z'),
            ...(i !== 2 && { completedAt: new Date(`2026-10-0${i + 2}T00:00:00Z`) }),
          },
        });
      }
      const result = await listPatientVisits(actor, f.patient.id, 1, 1);
      expect(result.meta).toEqual({ page: 1, size: 1, totalItems: 2, totalPages: 2 });
      expect(result.data[0]).toMatchObject({
        patientId: f.patient.id,
        department: { id: f.department.id },
        doctor: { id: f.doctor.id },
        displayStatus: 'COMPLETED',
      });
      expect(result.data[0]).not.toHaveProperty('symptoms');
      await expect(
        listPatientVisits({ ...actor, role: 'NURSE' }, f.patient.id, 1, 20),
      ).rejects.toMatchObject({ status: 403 });
      await expect(listPatientVisits(actor, 'missing', 1, 20)).rejects.toMatchObject({
        status: 404,
      });
    });
  });
  it('HTTP는 직원만 허용하고 페이지 입력을 검사한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      let role: AccountContext['role'] = 'STAFF';
      const app = express();
      app.locals.accountProvider = async () => ({
        id: f.admin.id,
        role,
        status: 'ACTIVE',
        departmentId: null,
      });
      app.use('/patients', patientRouter, errorHandler);
      const endpoint = `/patients/${f.patient.id}/visits`;
      expect((await request(app).get(`${endpoint}?page=0`)).status).toBe(400);
      const response = await request(app).get(endpoint);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ data: [], meta: { page: 1, size: 20, totalItems: 0 } });
      role = 'NURSE';
      expect((await request(app).get(endpoint)).status).toBe(403);
    });
  });
});
