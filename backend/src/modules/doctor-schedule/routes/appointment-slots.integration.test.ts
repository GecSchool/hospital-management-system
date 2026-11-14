import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../common/errors/index.js';
import { createAccountProvider } from '../../../common/middlewares/account-provider.js';
import * as db from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { appointmentSlotsRouter } from './appointment-slots.routes.js';
const prisma = db.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('예약 가능 시간 HTTP API', () => {
  it('인증·역할·날짜를 검사하고 간호사는 본인 과만 조회한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      let id: string | null = f.nurse.id;
      vi.spyOn(db, 'getPrismaClient').mockReturnValue(tx as ReturnType<typeof db.getPrismaClient>);
      const app = express();
      app.locals.accountProvider = createAccountProvider(
        async () => id,
        () => tx,
      );
      app.use('/api/v1', appointmentSlotsRouter);
      app.use(errorHandler);
      const path = `/api/v1/doctors/${f.doctor.id}/appointment-slots`;
      expect((await request(app).get(path)).status).toBe(400);
      const res = await request(app).get(path).query({ date: '2030-01-06' });
      expect(res.status).toBe(200);
      expect(res.body.data.slots).toHaveLength(72);
      id = f.admin.id;
      expect((await request(app).get(path).query({ date: '2030-01-06' })).status).toBe(403);
      id = null;
      expect((await request(app).get(path).query({ date: '2030-01-06' })).status).toBe(401);
    });
  });
});
