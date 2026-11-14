import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../../config/prisma.js';
import { errorHandler } from '../../../common/errors/index.js';
import { createAccountProvider } from '../../../common/middlewares/account-provider.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { adminDashboardRouter } from './admin-dashboard.routes.js';
const prisma = db.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('관리자 대시보드 HTTP API', () => {
  it('관리자에게만 계정과 진료과 집계를 전달한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(db, 'getPrismaClient').mockReturnValue(tx as ReturnType<typeof db.getPrismaClient>);
      let actor: string | null = f.admin.id;
      const app = express();
      app.locals.accountProvider = createAccountProvider(
        async () => actor,
        () => tx,
      );
      app.use('/api/v1/dashboards', adminDashboardRouter);
      app.use(errorHandler);
      const result = await request(app).get('/api/v1/dashboards/admin');
      expect(result.status).toBe(200);
      expect(result.body.meta).toBeNull();
      expect(result.body.data.accountsByRole).toHaveProperty('STAFF');
      expect(result.body.data.departmentsByStatus).toHaveProperty('INACTIVE');
      actor = f.nurse.id;
      expect((await request(app).get('/api/v1/dashboards/admin')).status).toBe(403);
      actor = null;
      expect((await request(app).get('/api/v1/dashboards/admin')).status).toBe(401);
    });
  });
});
