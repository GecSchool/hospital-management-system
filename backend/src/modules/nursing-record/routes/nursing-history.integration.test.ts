import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../../config/prisma.js';
import { errorHandler } from '../../../common/errors/index.js';
import { createAccountProvider } from '../../../common/middlewares/account-provider.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { nursingHistoryRouter } from './nursing-history.routes.js';
const prisma = db.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('환자 간호 이력 HTTP API', () => {
  it('같은 과 간호사는 선택 접수로 빈 이력을 조회하고 다른 역할은 거부한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const rec = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      vi.spyOn(db, 'getPrismaClient').mockReturnValue(tx as ReturnType<typeof db.getPrismaClient>);
      let actor: string | null = f.nurse.id;
      const app = express();
      app.locals.accountProvider = createAccountProvider(
        async () => actor,
        () => tx,
      );
      app.use('/api/v1', nursingHistoryRouter);
      app.use(errorHandler);
      const path = `/api/v1/patients/${f.patient.id}/nursing-records`;
      expect((await request(app).get(path).query({ receptionId: rec.id })).body).toEqual({
        data: [],
        meta: { nextBefore: null, hasMore: false },
      });
      expect((await request(app).get(path)).status).toBe(400);
      expect(
        (await request(app).get(path).query({ receptionId: rec.id, before: 'bad' })).status,
      ).toBe(400);
      actor = f.doctor.id;
      expect((await request(app).get(path).query({ receptionId: rec.id })).status).toBe(403);
      actor = null;
      expect((await request(app).get(path).query({ receptionId: rec.id })).status).toBe(401);
    });
  });
});
