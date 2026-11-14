import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../../config/prisma.js';
import { errorHandler } from '../../../common/errors/index.js';
import { createAccountProvider } from '../../../common/middlewares/account-provider.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { clinicalHistoryRouter } from './clinical-history.routes.js';
const prisma = db.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('진료 이력 HTTP API', () => {
  it('본인 환자의 초진에 빈 이력을 반환하고 커서와 역할을 검증한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      vi.spyOn(db, 'getPrismaClient').mockReturnValue(tx as ReturnType<typeof db.getPrismaClient>);
      let actor: string | null = f.doctor.id;
      const app = express();
      app.locals.accountProvider = createAccountProvider(
        async () => actor,
        () => tx,
      );
      app.use('/api/v1', clinicalHistoryRouter);
      app.use(errorHandler);
      const path = `/api/v1/patients/${f.patient.id}/clinical-history`;
      expect((await request(app).get(path)).body).toEqual({
        data: [],
        meta: { nextBefore: null, hasMore: false },
      });
      expect((await request(app).get(path).query({ before: 'wrong' })).status).toBe(400);
      actor = f.nurse.id;
      expect((await request(app).get(path)).status).toBe(403);
      actor = null;
      expect((await request(app).get(path)).status).toBe(401);
    });
  });
});
