import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { decodeCursor } from '../../../common/utils/cursor.js';
import {
  listNursingRecords,
  getNursingRecord,
  getNursingVersion,
} from './nursing-record-query.service.js';
const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('간호 기록 조회', () => {
  it('접수의 기록을 원본 시각과 ID 기준으로 페이지 조회하고 정정 이력을 조회한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const rec = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const record = await tx.nursingRecord.create({
          data: { receptionId: rec.id, originalAuthorAccountId: f.nurse.id },
        });
        ids.push(record.id);
        await tx.nursingRecordVersion.create({
          data: {
            recordId: record.id,
            versionNo: 1,
            content: `원본${i}`,
            authorAccountId: f.nurse.id,
            createdAt: new Date(`2030-01-01T0${i}:00:00Z`),
          },
        });
      }
      await tx.nursingRecordVersion.create({
        data: {
          recordId: ids[2],
          versionNo: 2,
          content: '정정',
          correctionReason: '오류',
          authorAccountId: f.nurse.id,
        },
      });
      const nurse = {
        id: f.nurse.id,
        role: 'NURSE' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      const doctor = {
        id: f.doctor.id,
        role: 'DOCTOR' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      const first = await listNursingRecords(nurse, rec.id, { limit: 2 });
      expect(first.data.map((r: { id: string }) => r.id)).toEqual(ids.slice(1));
      expect(first.data[1].latestVersion).toMatchObject({
        versionNo: 2,
        content: '정정',
        correctionReason: '오류',
      });
      expect(first.meta.hasMore).toBe(true);
      const second = await listNursingRecords(doctor, rec.id, {
        limit: 2,
        before: decodeCursor(first.meta.nextBefore!),
      });
      expect(second.data.map((r: { id: string }) => r.id)).toEqual(ids.slice(0, 1));
      expect(second.meta).toMatchObject({ hasMore: false, nextBefore: null });
      expect(
        (await getNursingRecord(nurse, ids[2])).versions.map(
          (v: { versionNo: number }) => v.versionNo,
        ),
      ).toEqual([1, 2]);
      expect(await getNursingVersion(doctor, ids[2], 1)).toMatchObject({
        versionNo: 1,
        content: '원본2',
        correctionReason: null,
      });
      await expect(getNursingVersion(doctor, ids[2], 3)).rejects.toMatchObject({ status: 404 });
      await expect(
        getNursingRecord({ ...nurse, departmentId: f.otherDepartment.id }, ids[2]),
      ).rejects.toMatchObject({ status: 403 });
      await expect(getNursingRecord({ ...doctor, id: 'other' }, ids[2])).rejects.toMatchObject({
        status: 403,
      });
      await expect(getNursingRecord({ ...nurse, role: 'STAFF' }, ids[2])).rejects.toMatchObject({
        status: 403,
      });
    });
  });
});
