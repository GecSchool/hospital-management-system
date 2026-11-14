import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { completeVisit, correctClinicalRecord } from './clinical-record-write.service.js';
import {
  parseClinicalComplete,
  parseClinicalCorrection,
} from '../validations/clinical-record-write.validation.js';
import express from 'express';
import request from 'supertest';
import { createAccountProvider } from '../../../common/middlewares/account-provider.js';
import { errorHandler } from '../../../common/errors/index.js';
import { clinicalRecordWriteRouter } from '../routes/clinical-record-write.routes.js';
const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
const input = { symptoms: '기침', diagnosis: '진단', opinion: '소견' };
describe('진료 완료 및 기록 정정', () => {
  it('요청값·버전번호·정정사유를 검증한다', () => {
    expect(() => parseClinicalComplete({ symptoms: '기침', diagnosis: '진단' })).toThrow();
    expect(() =>
      parseClinicalCorrection({ ...input, baseVersionNo: 0, correctionReason: '사유' }),
    ).toThrow();
    expect(() =>
      parseClinicalCorrection({ ...input, baseVersionNo: 1, correctionReason: '  ' }),
    ).toThrow();
    expect(
      parseClinicalCorrection({ ...input, baseVersionNo: 1, correctionReason: '보완' }),
    ).toMatchObject({ baseVersionNo: 1 });
  });
  it('담당 의사만 완료·정정하며 원본과 이전 버전이 보존된다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const entry = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          status: 'CALLED',
        },
      });
      const visit = await tx.visit.create({ data: { receptionId: entry.id } });
      const other = await tx.account.create({
        data: {
          name: '다른 의사',
          email: `other-${f.admin.id}@example.test`,
          passwordHash: 'test',
          role: 'DOCTOR',
          doctor: { create: { departmentId: f.department.id } },
        },
      });
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        new Proxy(tx, {
          get(t, k, r) {
            if (k === '$transaction')
              return async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx);
            return Reflect.get(t, k, r);
          },
        }) as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const doctor = {
        id: f.doctor.id,
        role: 'DOCTOR' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      await expect(
        completeVisit({ ...doctor, id: other.id }, visit.id, input),
      ).rejects.toMatchObject({ status: 403 });
      const completed = (await completeVisit(doctor, visit.id, input)) as {
        record: { id: string };
        version: { versionNo: number; correctionReason: null };
        visit: { status: string };
      };
      expect(completed.visit.status).toBe('COMPLETED');
      expect(completed.version).toMatchObject({ versionNo: 1, correctionReason: null });
      await expect(completeVisit(doctor, visit.id, input)).rejects.toMatchObject({
        status: 409,
        code: 'VISIT_ALREADY_COMPLETED',
      });
      const correction = {
        ...input,
        diagnosis: '수정된 진단',
        baseVersionNo: 1,
        correctionReason: '기록 보완',
      };
      await expect(
        correctClinicalRecord({ ...doctor, id: other.id }, completed.record.id, correction),
      ).rejects.toMatchObject({ status: 403 });
      expect(await correctClinicalRecord(doctor, completed.record.id, correction)).toMatchObject({
        versionNo: 2,
        diagnosis: '수정된 진단',
        correctionReason: '기록 보완',
      });
      await expect(
        correctClinicalRecord(doctor, completed.record.id, correction),
      ).rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
      expect(
        await tx.clinicalRecordVersion.count({ where: { recordId: completed.record.id } }),
      ).toBe(2);
    });
  });
  it('동시 진료 완료와 동일 기준 버전 정정은 각각 한 번만 성공한다', async () => {
    const f = await createMedicalStaffFixture(prisma);
    const actor = {
      id: f.doctor.id,
      role: 'DOCTOR' as const,
      status: 'ACTIVE' as const,
      departmentId: f.department.id,
    };
    vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(prisma);
    try {
      const entry = await prisma.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          status: 'CALLED',
        },
      });
      const visit = await prisma.visit.create({ data: { receptionId: entry.id } });
      const complete = await Promise.allSettled([
        completeVisit(actor, visit.id, input),
        completeVisit(actor, visit.id, input),
      ]);
      expect(complete.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(complete.find((x) => x.status === 'rejected')).toMatchObject({
        status: 'rejected',
        reason: { code: 'VISIT_ALREADY_COMPLETED' },
      });
      const record = await prisma.clinicalRecord.findUniqueOrThrow({
        where: { visitId: visit.id },
      });
      const correction = { ...input, baseVersionNo: 1, correctionReason: '정정' };
      const results = await Promise.allSettled([
        correctClinicalRecord(actor, record.id, correction),
        correctClinicalRecord(actor, record.id, correction),
      ]);
      expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((x) => x.status === 'rejected')).toMatchObject({
        status: 'rejected',
        reason: { code: 'VERSION_CONFLICT' },
      });
      expect(
        (
          await prisma.clinicalRecordVersion.findMany({
            where: { recordId: record.id },
            orderBy: { versionNo: 'asc' },
          })
        ).map((x) => x.versionNo),
      ).toEqual([1, 2]);
    } finally {
      await prisma.clinicalRecordVersion.deleteMany({ where: { authorAccountId: f.doctor.id } });
      await prisma.clinicalRecord.deleteMany({
        where: { visit: { reception: { doctorAccountId: f.doctor.id } } },
      });
      await prisma.visit.deleteMany({ where: { reception: { doctorAccountId: f.doctor.id } } });
      await prisma.reception.deleteMany({ where: { doctorAccountId: f.doctor.id } });
      await prisma.patient.delete({ where: { id: f.patient.id } });
      await prisma.doctor.delete({ where: { accountId: f.doctor.id } });
      await prisma.nurse.delete({ where: { accountId: f.nurse.id } });
      await prisma.account.deleteMany({
        where: { id: { in: [f.admin.id, f.doctor.id, f.nurse.id] } },
      });
      await prisma.department.deleteMany({
        where: { id: { in: [f.department.id, f.otherDepartment.id, f.inactiveDepartment.id] } },
      });
    }
  });
  it('HTTP 완료·정정 요청에 권한과 입력 검증을 적용한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const entry = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      const visit = await tx.visit.create({ data: { receptionId: entry.id } });
      let id: string | null = f.nurse.id;
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        new Proxy(tx, {
          get(t, k, r) {
            if (k === '$transaction')
              return async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx);
            return Reflect.get(t, k, r);
          },
        }) as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const app = express();
      app.locals.accountProvider = createAccountProvider(
        async () => id,
        () => tx,
      );
      app.use(express.json(), clinicalRecordWriteRouter, errorHandler);
      expect((await request(app).post(`/visits/${visit.id}/complete`).send(input)).status).toBe(
        403,
      );
      id = f.doctor.id;
      expect(
        (await request(app).post(`/visits/${visit.id}/complete`).send({ symptoms: '기침' })).status,
      ).toBe(400);
      const completed = await request(app).post(`/visits/${visit.id}/complete`).send(input);
      expect(completed.status).toBe(200);
      const recordId = completed.body.data.record.id;
      expect(
        (
          await request(app)
            .post(`/clinical-records/${recordId}/versions`)
            .send({ ...input, baseVersionNo: 1, correctionReason: '  ' })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .post(`/clinical-records/${recordId}/versions`)
            .send({ ...input, baseVersionNo: 1, correctionReason: '보완' })
        ).status,
      ).toBe(201);
      id = null;
      expect((await request(app).post(`/visits/${visit.id}/complete`).send(input)).status).toBe(
        401,
      );
    });
  });
});
