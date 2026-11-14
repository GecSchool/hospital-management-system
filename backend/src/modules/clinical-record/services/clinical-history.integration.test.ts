import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { getClinicalHistory } from './clinical-history.service.js';
import { decodeCursor } from '../../../common/utils/cursor.js';
const prisma = db.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('환자 진료 이력', () => {
  it('권한 환자의 타 의사 완료 기록을 최신 묶음부터 제공하고 정정된 진단을 요약한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const other = await tx.account.create({
        data: {
          name: '이전 의사',
          email: `history-${f.admin.id}@example.test`,
          role: 'DOCTOR',
          passwordHash: 'test',
          doctor: { create: { departmentId: f.department.id } },
        },
      });
      const actor = {
        id: f.doctor.id,
        role: 'DOCTOR' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      vi.spyOn(db, 'getPrismaClient').mockReturnValue(tx as ReturnType<typeof db.getPrismaClient>);
      await expect(getClinicalHistory(f.patient.id, actor, { limit: 2 })).rejects.toMatchObject({
        status: 403,
      });
      await tx.appointment.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2030-01-06T00:00:00Z'),
        },
      });
      expect(await getClinicalHistory(f.patient.id, actor, { limit: 2 })).toEqual({
        data: [],
        meta: { nextBefore: null, hasMore: false },
      });
      const ids = ['a', 'b', 'c'].map((s) => `${s}-${f.admin.id}`);
      for (const [i, id] of ids.entries()) {
        const rec = await tx.reception.create({
          data: {
            patientId: f.patient.id,
            doctorAccountId: other.id,
            departmentId: f.department.id,
          },
        });
        const at = new Date(i === 2 ? '2026-02-01T00:00:00Z' : '2026-01-01T00:00:00Z');
        const visit = await tx.visit.create({
          data: { id, receptionId: rec.id, status: 'COMPLETED', startedAt: at, completedAt: at },
        });
        await tx.clinicalRecord.create({
          data: {
            visitId: visit.id,
            versions: {
              create: [
                {
                  versionNo: 1,
                  symptoms: '증상',
                  diagnosis: `원본-${i}`,
                  opinion: '소견',
                  authorAccountId: other.id,
                },
                {
                  versionNo: 2,
                  symptoms: '증상',
                  diagnosis: `최신-${i}`,
                  opinion: '소견',
                  correctionReason: '정정',
                  authorAccountId: other.id,
                },
              ],
            },
          },
        });
      }
      const pending = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      await tx.visit.create({ data: { receptionId: pending.id, status: 'IN_PROGRESS' } });
      const first = await getClinicalHistory(f.patient.id, actor, { limit: 2 });
      expect(first.data.map((x) => x.visitId)).toEqual([ids[1], ids[2]]);
      expect(first.data.map((x) => x.summary)).toEqual(['최신-1', '최신-2']);
      expect(first.data[0].doctor.id).toBe(other.id);
      expect(first.meta.hasMore).toBe(true);
      const second = await getClinicalHistory(f.patient.id, actor, {
        limit: 2,
        before: decodeCursor(first.meta.nextBefore!),
      });
      expect(second.data.map((x) => x.visitId)).toEqual([ids[0]]);
      expect(second.meta).toEqual({ nextBefore: null, hasMore: false });
    });
  });
});
