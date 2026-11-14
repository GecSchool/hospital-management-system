import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { getClinicalRecord, getClinicalVersion } from './clinical-record-query.service.js';
const prisma = db.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('의사 진료 기록·버전 조회', () => {
  it('담당 환자의 다른 의사 원본·정정 기록을 최신 기준으로 조회한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const other = await tx.account.create({
        data: {
          name: '이전 의사',
          email: `doc-${f.admin.id}@example.test`,
          role: 'DOCTOR',
          passwordHash: 'test',
          doctor: { create: { departmentId: f.department.id } },
        },
      });
      const rec = await tx.reception.create({
        data: { patientId: f.patient.id, doctorAccountId: other.id, departmentId: f.department.id },
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
            create: [
              {
                versionNo: 1,
                symptoms: '원본 증상',
                diagnosis: '진단',
                opinion: '소견',
                authorAccountId: other.id,
              },
              {
                versionNo: 2,
                symptoms: '정정 증상',
                diagnosis: '진단2',
                opinion: '소견2',
                authorAccountId: other.id,
                correctionReason: '오타 정정',
              },
            ],
          },
        },
      });
      vi.spyOn(db, 'getPrismaClient').mockReturnValue(tx as ReturnType<typeof db.getPrismaClient>);
      const actor = {
        id: f.doctor.id,
        role: 'DOCTOR' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      await expect(getClinicalRecord(record.id, actor)).rejects.toMatchObject({ status: 403 });
      await tx.appointment.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2030-01-06T00:00:00Z'),
        },
      });
      const result = await getClinicalRecord(record.id, actor);
      expect(result).toMatchObject({
        id: record.id,
        visitId: visit.id,
        latestVersion: {
          recordId: record.id,
          versionNo: 2,
          symptoms: '정정 증상',
          correctionReason: '오타 정정',
          author: { id: other.id },
        },
      });
      expect(result.versions.map((v) => v.versionNo)).toEqual([1, 2]);
      const original = await getClinicalVersion(record.id, 1, actor);
      expect(original).toMatchObject({
        recordId: record.id,
        versionNo: 1,
        symptoms: '원본 증상',
        correctionReason: null,
        author: { id: other.id },
      });
      await expect(getClinicalVersion(record.id, 3, actor)).rejects.toMatchObject({ status: 404 });
    });
  });
});
