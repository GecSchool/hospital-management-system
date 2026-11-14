import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { decodeCursor } from '../../../common/utils/cursor.js';
import { getNursingHistory } from './nursing-history.service.js';
const prisma = db.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('환자 간호 이력', () => {
  it('선택 접수의 앞뒤 이력을 같은 과만 최신 묶음에서 과거순으로 반환한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const actor = {
        id: f.nurse.id,
        role: 'NURSE' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      const selected = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          receivedAt: new Date('2026-01-15T00:00:00Z'),
        },
      });
      vi.spyOn(db, 'getPrismaClient').mockReturnValue(tx as ReturnType<typeof db.getPrismaClient>);
      expect(
        await getNursingHistory(f.patient.id, actor, { receptionId: selected.id, limit: 2 }),
      ).toEqual({ data: [], meta: { nextBefore: null, hasMore: false } });
      const ids = ['a', 'b', 'c'].map((c) => `${c}-${f.admin.id}`);
      for (const [i, id] of ids.entries()) {
        const at = new Date(i === 2 ? '2026-02-01T00:00:00Z' : '2026-01-01T00:00:00Z');
        const rec = await tx.reception.create({
          data: {
            patientId: f.patient.id,
            doctorAccountId: f.doctor.id,
            departmentId: f.department.id,
            receivedAt: at,
          },
        });
        await tx.nursingRecord.create({
          data: {
            id,
            receptionId: rec.id,
            originalAuthorAccountId: f.nurse.id,
            versions: {
              create: [
                { versionNo: 1, content: `원본-${i}`, authorAccountId: f.nurse.id, createdAt: at },
                {
                  versionNo: 2,
                  content: `최신-${i}`,
                  correctionReason: '정정',
                  authorAccountId: f.nurse.id,
                  createdAt: new Date(at.getTime() + 60000),
                },
              ],
            },
          },
        });
      }
      const other = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.otherDepartment.id,
        },
      });
      await tx.nursingRecord.create({
        data: {
          receptionId: other.id,
          originalAuthorAccountId: f.nurse.id,
          versions: { create: { versionNo: 1, content: '다른 과', authorAccountId: f.nurse.id } },
        },
      });
      const first = await getNursingHistory(f.patient.id, actor, {
        receptionId: selected.id,
        limit: 2,
      });
      expect(first.data.map((x) => x.id)).toEqual([ids[1], ids[2]]);
      expect(first.data.map((x) => x.latestVersion.content)).toEqual(['최신-1', '최신-2']);
      expect(first.meta.hasMore).toBe(true);
      const older = await getNursingHistory(f.patient.id, actor, {
        receptionId: selected.id,
        limit: 2,
        before: decodeCursor(first.meta.nextBefore!),
      });
      expect(older.data.map((x) => x.id)).toEqual([ids[0]]);
      expect(older.meta).toEqual({ hasMore: false, nextBefore: null });
      await expect(
        getNursingHistory(f.patient.id, actor, { receptionId: other.id, limit: 2 }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        getNursingHistory('different-patient', actor, { receptionId: selected.id, limit: 2 }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});
