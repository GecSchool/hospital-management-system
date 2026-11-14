import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../../config/prisma.js';
import { errorHandler } from '../../../common/errors/index.js';
import { createAccountProvider } from '../../../common/middlewares/account-provider.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { nursingRecordQueryRouter } from './nursing-record-query.routes.js';
const prisma = db.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('간호 기록 조회 HTTP API', () => {
  it('간호사와 담당 환자의 의사는 조회하고 잘못된 입력과 다른 역할은 거부한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const rec = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      const record = await tx.nursingRecord.create({
        data: {
          receptionId: rec.id,
          originalAuthorAccountId: f.nurse.id,
          versions: { create: { versionNo: 1, content: '기록', authorAccountId: f.nurse.id } },
        },
      });
      vi.spyOn(db, 'getPrismaClient').mockReturnValue(tx as ReturnType<typeof db.getPrismaClient>);
      let actor: string | null = f.nurse.id;
      const app = express();
      app.locals.accountProvider = createAccountProvider(
        async () => actor,
        () => tx,
      );
      app.use('/api/v1', nursingRecordQueryRouter);
      app.use(errorHandler);
      const list = `/api/v1/receptions/${rec.id}/nursing-records`,
        detail = `/api/v1/nursing-records/${record.id}`;
      expect((await request(app).get(list)).body.data).toHaveLength(1);
      expect((await request(app).get(list + '?limit=0')).status).toBe(400);
      expect((await request(app).get(list + '?before=invalid')).status).toBe(400);
      expect((await request(app).get(detail + '/versions/1')).body.data.content).toBe('기록');
      expect((await request(app).get(detail + '/versions/0')).status).toBe(400);
      actor = f.doctor.id;
      expect((await request(app).get(detail)).status).toBe(200);
      actor = f.admin.id;
      expect((await request(app).get(detail)).status).toBe(403);
      actor = null;
      expect((await request(app).get(detail)).status).toBe(401);
    });
  });
});
