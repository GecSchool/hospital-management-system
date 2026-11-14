import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { getClinicalRecord } from './clinical-record-query.service.js';

const reader = db.createPrismaClient(testDatabaseUrl());
const writer = db.createPrismaClient(testDatabaseUrl());
afterAll(async () => {
  await reader.$disconnect();
  await writer.$disconnect();
});
afterEach(() => vi.restoreAllMocks());

describe('진료 기록 상세 조회와 동시 정정', () => {
  it('메타를 읽은 직후 다른 연결이 정정해도 최신 본문과 버전 목록은 서로 일치한다', async () => {
    const f = await createMedicalStaffFixture(reader);
    try {
      const rec = await reader.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      const visit = await reader.visit.create({
        data: {
          receptionId: rec.id,
          status: 'COMPLETED',
          startedAt: new Date('2026-01-01T00:00:00Z'),
          completedAt: new Date('2026-01-01T01:00:00Z'),
        },
      });
      const record = await reader.clinicalRecord.create({
        data: {
          visitId: visit.id,
          versions: {
            create: {
              versionNo: 1,
              symptoms: '원본',
              diagnosis: '원본 진단',
              opinion: '원본 소견',
              authorAccountId: f.doctor.id,
            },
          },
        },
      });
      let inserted = false;
      const versionDelegate = reader.clinicalRecordVersion;
      const controlledDelegate = new Proxy(versionDelegate, {
        get(target, key, receiver) {
          if (key === 'findMany')
            return async (...args: Parameters<typeof versionDelegate.findMany>) => {
              const rows = await versionDelegate.findMany(...args);
              if (!inserted) {
                inserted = true;
                await writer.clinicalRecordVersion.create({
                  data: {
                    recordId: record.id,
                    versionNo: 2,
                    symptoms: '동시 정정',
                    diagnosis: '정정 진단',
                    opinion: '정정 소견',
                    correctionReason: '보완',
                    authorAccountId: f.doctor.id,
                  },
                });
              }
              return rows;
            };
          return Reflect.get(target, key, receiver);
        },
      });
      const controlledReader = new Proxy(reader, {
        get(target, key, receiver) {
          if (key === 'clinicalRecordVersion') return controlledDelegate;
          return Reflect.get(target, key, receiver);
        },
      });
      vi.spyOn(db, 'getPrismaClient').mockReturnValue(
        controlledReader as ReturnType<typeof db.getPrismaClient>,
      );
      const actor = {
        id: f.doctor.id,
        role: 'DOCTOR' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      const first = await getClinicalRecord(record.id, actor);
      expect(inserted).toBe(true);
      expect(first.versions.map((v) => v.versionNo)).toEqual([1]);
      expect(first.latestVersion.versionNo).toBe(first.versions.at(-1)?.versionNo);
      expect(first.latestVersion.symptoms).toBe('원본');
      expect(
        (
          await writer.clinicalRecordVersion.findUniqueOrThrow({
            where: { recordId_versionNo: { recordId: record.id, versionNo: 2 } },
          })
        ).symptoms,
      ).toBe('동시 정정');
      const after = await getClinicalRecord(record.id, actor);
      expect(after.versions.map((v) => v.versionNo)).toEqual([1, 2]);
      expect(after.latestVersion).toMatchObject({ versionNo: 2, symptoms: '동시 정정' });
    } finally {
      const records = await reader.clinicalRecord.findMany({
        where: { visit: { reception: { patientId: f.patient.id } } },
        select: { id: true },
      });
      await reader.clinicalRecordVersion.deleteMany({
        where: { recordId: { in: records.map((r) => r.id) } },
      });
      await reader.clinicalRecord.deleteMany({ where: { id: { in: records.map((r) => r.id) } } });
      await reader.visit.deleteMany({ where: { reception: { patientId: f.patient.id } } });
      await reader.reception.deleteMany({ where: { patientId: f.patient.id } });
      await reader.doctor.deleteMany({ where: { accountId: f.doctor.id } });
      await reader.nurse.deleteMany({ where: { accountId: f.nurse.id } });
      await reader.patient.deleteMany({ where: { id: f.patient.id } });
      await reader.account.deleteMany({
        where: { id: { in: [f.admin.id, f.doctor.id, f.nurse.id] } },
      });
      await reader.department.deleteMany({
        where: { id: { in: [f.department.id, f.otherDepartment.id, f.inactiveDepartment.id] } },
      });
    }
  });
});
