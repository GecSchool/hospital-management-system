import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../common/errors/index.js';
import { createAccountProvider } from '../../../common/middlewares/account-provider.js';
import * as dbConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { availabilityRouter } from './availability.routes.js';

const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());

describe('진료 가능 시간 HTTP 요청', () => {
  it('의사만 본인 시간표를 저장하고 직원·본인과 간호사는 조회한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const staff = await tx.account.create({
        data: {
          name: '직원',
          email: `staff-${f.admin.id}@example.test`,
          passwordHash: 'test',
          role: 'STAFF',
        },
      });
      let accountId: string | null = f.doctor.id;
      const db = new Proxy(tx, {
        get(target, key, receiver) {
          if (key === '$transaction')
            return async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx);
          return Reflect.get(target, key, receiver);
        },
      });
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        db as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const app = express();
      app.locals.accountProvider = createAccountProvider(
        async () => accountId,
        () => tx,
      );
      app.use(express.json());
      app.use('/api/v1', availabilityRouter);
      app.use(errorHandler);
      const path = '/api/v1/doctors/me/availability';
      const invalid = await request(app)
        .put(path)
        .send({ weeklySlots: [{ dayOfWeek: 1, startTime: '09:10', endTime: '10:00' }] });
      expect(invalid.status).toBe(400);
      const saved = await request(app)
        .put(path)
        .send({ weeklySlots: [{ dayOfWeek: 1, startTime: '09:00', endTime: '10:00' }] });
      expect(saved.status).toBe(200);
      expect(saved.body.data).toEqual({
        doctorId: f.doctor.id,
        intervalMinutes: 20,
        weeklySlots: [{ dayOfWeek: 1, startTime: '09:00', endTime: '10:00' }],
      });
      accountId = staff.id;
      expect((await request(app).get(`/api/v1/doctors/${f.doctor.id}/availability`)).status).toBe(
        200,
      );
      expect((await request(app).put(path).send({ weeklySlots: [] })).status).toBe(403);
      accountId = f.nurse.id;
      expect((await request(app).get(`/api/v1/doctors/${f.doctor.id}/availability`)).status).toBe(
        200,
      );
      accountId = f.admin.id;
      expect((await request(app).get(`/api/v1/doctors/${f.doctor.id}/availability`)).status).toBe(
        403,
      );
      accountId = null;
      expect((await request(app).get(`/api/v1/doctors/${f.doctor.id}/availability`)).status).toBe(
        401,
      );
    });
  });
});
