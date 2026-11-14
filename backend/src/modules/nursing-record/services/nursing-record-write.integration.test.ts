import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { createNursingRecord, correctNursingRecord } from './nursing-record-write.service.js';
import {
  parseNursingCreate,
  parseNursingCorrection,
} from '../validations/nursing-record-write.validation.js';
import { deleteReception } from '../../reception/services/reception.service.js';
import express from 'express';
import request from 'supertest';
import { createAccountProvider } from '../../../common/middlewares/account-provider.js';
import { errorHandler } from '../../../common/errors/index.js';
import { nursingRecordWriteRouter } from '../routes/nursing-record-write.routes.js';
const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('간호기록 작성·정정', () => {
  it('기록 내용과 기준 버전·정정 사유를 검증한다', () => {
    expect(() => parseNursingCreate({})).toThrow();
    expect(() =>
      parseNursingCorrection({ content: '처치', baseVersionNo: 0, correctionReason: '정정' }),
    ).toThrow();
    expect(() =>
      parseNursingCorrection({ content: '처치', baseVersionNo: 1, correctionReason: ' ' }),
    ).toThrow();
    expect(
      parseNursingCorrection({ content: '처치', baseVersionNo: 1, correctionReason: '보완' })
        .baseVersionNo,
    ).toBe(1);
  });
  it('같은 과의 다른 간호사가 정정할 수 있고 원본 작성자를 보존한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const other = await tx.account.create({
        data: {
          name: '간호사2',
          email: `nurse2-${f.admin.id}@example.test`,
          passwordHash: 'test',
          role: 'NURSE',
          nurse: { create: { departmentId: f.department.id } },
        },
      });
      const entry = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      const n1 = {
        id: f.nurse.id,
        role: 'NURSE' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      const n2 = { ...n1, id: other.id };
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        new Proxy(tx, {
          get(t, k, r) {
            if (k === '$transaction')
              return async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx);
            return Reflect.get(t, k, r);
          },
        }) as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const rec = (await createNursingRecord(n1, entry.id, { content: '원본' })) as {
        id: string;
        author: { id: string };
        latestVersion: { versionNo: number; author: { id: string } };
      };
      expect(rec.author.id).toBe(n1.id);
      expect(rec.latestVersion).toMatchObject({ versionNo: 1, author: { id: n1.id } });
      const correction = { content: '정정', baseVersionNo: 1, correctionReason: '기록 보완' };
      expect(await correctNursingRecord(n2, rec.id, correction)).toMatchObject({
        versionNo: 2,
        author: { id: n2.id },
      });
      expect(
        (await tx.nursingRecord.findUniqueOrThrow({ where: { id: rec.id } }))
          .originalAuthorAccountId,
      ).toBe(n1.id);
      await expect(correctNursingRecord(n1, rec.id, correction)).rejects.toMatchObject({
        status: 409,
        code: 'VERSION_CONFLICT',
      });
      await tx.nurse.update({
        where: { accountId: n2.id },
        data: { departmentId: f.otherDepartment.id },
      });
      await expect(
        correctNursingRecord(n2, rec.id, { ...correction, baseVersionNo: 2 }),
      ).rejects.toMatchObject({ status: 403 });
      expect(await tx.nursingRecordVersion.count({ where: { recordId: rec.id } })).toBe(2);
      const visit = await tx.visit.create({ data: { receptionId: entry.id } });
      expect(
        ((await createNursingRecord(n1, entry.id, { content: '진료 중' })) as { id: string }).id,
      ).toBeTruthy();
      const completedAt = new Date();
      await tx.visit.update({
        where: { id: visit.id },
        data: { status: 'COMPLETED', completedAt },
      });
      expect(
        ((await createNursingRecord(n1, entry.id, { content: '완료 후' })) as { id: string }).id,
      ).toBeTruthy();
    });
  });
  it('기록 생성·접수 삭제 및 같은 기준 버전 정정 동시 요청은 일관성을 유지한다', async () => {
    const f = await createMedicalStaffFixture(prisma);
    const staff = await prisma.account.create({
      data: {
        email: `staff-${f.admin.id}@example.test`,
        name: '직원',
        role: 'STAFF',
        passwordHash: 'test',
      },
    });
    const nurse = {
      id: f.nurse.id,
      role: 'NURSE' as const,
      status: 'ACTIVE' as const,
      departmentId: f.department.id,
    };
    const employee = {
      id: staff.id,
      role: 'STAFF' as const,
      status: 'ACTIVE' as const,
      departmentId: null,
    };
    vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(prisma);
    try {
      const entry = await prisma.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      const outcomes = await Promise.allSettled([
        createNursingRecord(nurse, entry.id, { content: '처치' }),
        deleteReception(employee, entry.id),
      ]);
      expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      const saved = await prisma.reception.findUnique({ where: { id: entry.id } });
      const records = await prisma.nursingRecord.findMany({ where: { receptionId: entry.id } });
      if (saved) {
        expect(records).toHaveLength(1);
        expect(outcomes[1]).toMatchObject({
          status: 'rejected',
          reason: { code: 'RECEPTION_HAS_NURSING_RECORDS' },
        });
      } else {
        expect(records).toHaveLength(0);
        expect(outcomes[0]).toMatchObject({ status: 'rejected', reason: { status: 404 } });
      }
      const another = await prisma.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      const record = (await createNursingRecord(nurse, another.id, { content: '원본' })) as {
        id: string;
      };
      const correction = { content: '정정', baseVersionNo: 1, correctionReason: '보완' };
      const results = await Promise.allSettled([
        correctNursingRecord(nurse, record.id, correction),
        correctNursingRecord(nurse, record.id, correction),
      ]);
      expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((x) => x.status === 'rejected')).toMatchObject({
        status: 'rejected',
        reason: { code: 'VERSION_CONFLICT' },
      });
      expect(
        (
          await prisma.nursingRecordVersion.findMany({
            where: { recordId: record.id },
            orderBy: { versionNo: 'asc' },
          })
        ).map((x) => x.versionNo),
      ).toEqual([1, 2]);
    } finally {
      await prisma.nursingRecordVersion.deleteMany({
        where: { record: { originalAuthorAccountId: f.nurse.id } },
      });
      await prisma.nursingRecord.deleteMany({ where: { originalAuthorAccountId: f.nurse.id } });
      await prisma.reception.deleteMany({ where: { doctorAccountId: f.doctor.id } });
      await prisma.patient.delete({ where: { id: f.patient.id } });
      await prisma.doctor.delete({ where: { accountId: f.doctor.id } });
      await prisma.nurse.delete({ where: { accountId: f.nurse.id } });
      await prisma.account.deleteMany({
        where: { id: { in: [staff.id, f.admin.id, f.doctor.id, f.nurse.id] } },
      });
      await prisma.department.deleteMany({
        where: { id: { in: [f.department.id, f.otherDepartment.id, f.inactiveDepartment.id] } },
      });
    }
  });
  it('HTTP 요청에 인증·역할·입력 검증을 적용한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const entry = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      let id: string | null = f.doctor.id;
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
      app.use(express.json(), nursingRecordWriteRouter, errorHandler);
      expect(
        (
          await request(app)
            .post(`/receptions/${entry.id}/nursing-records`)
            .send({ content: '기록' })
        ).status,
      ).toBe(403);
      id = f.nurse.id;
      expect(
        (await request(app).post(`/receptions/${entry.id}/nursing-records`).send({})).status,
      ).toBe(400);
      const result = await request(app)
        .post(`/receptions/${entry.id}/nursing-records`)
        .send({ content: '기록' });
      expect(result.status).toBe(201);
      const rec = result.body.data.id;
      expect(
        (
          await request(app)
            .post(`/nursing-records/${rec}/versions`)
            .send({ content: '정정', baseVersionNo: 1, correctionReason: ' ' })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .post(`/nursing-records/${rec}/versions`)
            .send({ content: '정정', baseVersionNo: 1, correctionReason: '보완' })
        ).status,
      ).toBe(201);
      id = null;
      expect(
        (
          await request(app)
            .post(`/receptions/${entry.id}/nursing-records`)
            .send({ content: '기록' })
        ).status,
      ).toBe(401);
    });
  });
});
