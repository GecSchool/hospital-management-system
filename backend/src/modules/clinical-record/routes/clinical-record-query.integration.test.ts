import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../../config/prisma.js';
import { errorHandler } from '../../../common/errors/index.js';
import { createAccountProvider } from '../../../common/middlewares/account-provider.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { clinicalRecordQueryRouter } from './clinical-record-query.routes.js';
const prisma = db.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('진료 기록 조회 HTTP API', () => {
  it('의사는 자신의 환자 기록과 원본을 조회하고 다른 역할은 접근할 수 없다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const rec = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      const visit = await tx.visit.create({
        data: {
          receptionId: rec.id,
          status: 'COMPLETED',
          startedAt: new Date('2026-01-01T00:00:00Z'),
          completedAt: new Date('2026-01-01T00:20:00Z'),
        },
      });
      const record = await tx.clinicalRecord.create({
        data: {
          visitId: visit.id,
          versions: {
            create: {
              versionNo: 1,
              symptoms: '증상',
              diagnosis: '진단',
              opinion: '소견',
              authorAccountId: f.doctor.id,
            },
          },
        },
      });
      vi.spyOn(db, 'getPrismaClient').mockReturnValue(tx as ReturnType<typeof db.getPrismaClient>);
      let actor: string | null = f.doctor.id;
      const app = express();
      app.locals.accountProvider = createAccountProvider(
        async () => actor,
        () => tx,
      );
      app.use('/api/v1', clinicalRecordQueryRouter);
      app.use(errorHandler);
      const path = `/api/v1/clinical-records/${record.id}`;
      const result = await request(app).get(path);
      expect(result.status).toBe(200);
      expect(result.body.data.latestVersion.versionNo).toBe(1);
      const original = await request(app).get(path + '/versions/1');
      expect(original.status).toBe(200);
      expect(original.body.data.correctionReason).toBeNull();
      expect((await request(app).get(path + '/versions/0')).status).toBe(400);
      actor = f.nurse.id;
      expect((await request(app).get(path)).status).toBe(403);
      actor = null;
      expect((await request(app).get(path)).status).toBe(401);
    });
  });
});
