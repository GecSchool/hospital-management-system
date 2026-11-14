import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import { errorHandler } from '../../../common/errors/index.js';
import { createAccountProvider } from '../../../common/middlewares/account-provider.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { doctorScheduleRouter } from './doctor-schedule.routes.js';
const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('의사 일정 HTTP', () => {
  it('의사의 날짜 범위를 검증하여 반환하고 다른 역할 및 미인증을 차단한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      let actor: string | null = f.doctor.id;
      const app = express();
      app.locals.accountProvider = createAccountProvider(
        async () => actor,
        () => tx,
      );
      app.use('/api/v1/doctors', doctorScheduleRouter, errorHandler);
      const url = '/api/v1/doctors/me/schedule';
      const result = await request(app).get(`${url}?from=2030-01-01&to=2030-01-01`);
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({
        data: { from: '2030-01-01', to: '2030-01-01', visits: [] },
        meta: null,
      });
      expect((await request(app).get(url)).status).toBe(400);
      actor = f.nurse.id;
      expect((await request(app).get(`${url}?from=2030-01-01&to=2030-01-01`)).status).toBe(403);
      actor = null;
      expect((await request(app).get(`${url}?from=2030-01-01&to=2030-01-01`)).status).toBe(401);
    });
  });
});
