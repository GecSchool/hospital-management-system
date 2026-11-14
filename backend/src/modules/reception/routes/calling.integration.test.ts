import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../common/errors/index.js';
import { createAccountProvider } from '../../../common/middlewares/account-provider.js';
import * as db from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { callingRouter } from './calling.routes.js';
const prisma = db.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('호출과 입실 HTTP API', () => {
  it('본인 과 간호사만 호출·입실하고 Visit을 반환한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const reception = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      const proxy = new Proxy(tx, {
        get(t, k, r) {
          return k === '$transaction'
            ? async (fn: (tx: typeof t) => Promise<unknown>) => fn(t)
            : Reflect.get(t, k, r);
        },
      });
      vi.spyOn(db, 'getPrismaClient').mockReturnValue(
        proxy as ReturnType<typeof db.getPrismaClient>,
      );
      let id: string | null = f.doctor.id;
      const app = express();
      app.locals.accountProvider = createAccountProvider(
        async () => id,
        () => tx,
      );
      app.use('/api/v1', callingRouter);
      app.use(errorHandler);
      const path = `/api/v1/receptions/${reception.id}`;
      expect((await request(app).post(path + '/call')).status).toBe(403);
      id = f.nurse.id;
      const called = await request(app).post(path + '/call');
      expect(called.status).toBe(200);
      expect(called.body.data).toMatchObject({
        previousCalledReceptionId: null,
        reception: { status: 'CALLED', displayStatus: 'CALLED' },
      });
      const entry = await request(app).post(path + '/confirm-entry');
      expect(entry.status).toBe(201);
      expect(entry.body.data).toMatchObject({
        receptionId: reception.id,
        status: 'IN_PROGRESS',
        patient: { id: f.patient.id },
        department: { id: f.department.id },
        doctor: { id: f.doctor.id },
      });
      expect(entry.body.data.patient).not.toHaveProperty('patientNumber');
      id = null;
      expect((await request(app).post(path + '/call')).status).toBe(401);
    });
  });
});
