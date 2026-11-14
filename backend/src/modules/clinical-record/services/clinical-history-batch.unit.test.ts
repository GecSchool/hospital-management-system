import { afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { getClinicalHistory } from './clinical-history.service.js';

afterEach(() => vi.restoreAllMocks());
describe('진료 이력의 대량 페이지와 비정상 기록', () => {
  it('limit+1 확인 행의 진단은 읽지 않고 1000건 경계로 쪼갠다', async () => {
    const department = { id: 'department', name: '내과', status: 'ACTIVE' };
    const rows = Array.from({ length: 1002 }, (_, i) => ({
      id: `visit-${i}`,
      receptionId: `reception-${i}`,
      completedAt: new Date('2030-01-01T00:00:00Z'),
      clinicalRecord: { id: `record-${i}` },
      reception: {
        department,
        doctor: { accountId: 'doctor', account: { name: '의사' }, department },
      },
    }));
    const db = {
      patient: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'patient',
          patientNumber: 'number',
          name: '가상',
          birthDate: new Date('2000-01-01Z'),
          phone: '0000000',
        }),
      },
      visit: { findMany: vi.fn().mockResolvedValue(rows) },
      clinicalRecordVersion: {
        groupBy: vi.fn(async (q: { where: { recordId: { in: string[] } } }) =>
          q.where.recordId.in.map((recordId) => ({ recordId, _max: { versionNo: 8 } })),
        ),
        findMany: vi.fn(async (q: { where: { OR: { recordId: string; versionNo: number }[] } }) =>
          q.where.OR.map(({ recordId, versionNo }) => ({
            recordId,
            versionNo,
            diagnosis: `최신-${recordId}`,
          })),
        ),
      },
    };
    vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
      db as unknown as ReturnType<typeof dbConfig.getPrismaClient>,
    );
    const actor: AccountContext = {
      id: 'doctor',
      role: 'DOCTOR',
      status: 'ACTIVE',
      departmentId: 'department',
    };
    const result = await getClinicalHistory('patient', actor, { limit: 1001 });
    expect(result.data).toHaveLength(1001);
    expect(result.meta.hasMore).toBe(true);
    expect(result.data[0]).toMatchObject({ visitId: 'visit-1000', summary: '최신-record-1000' });
    expect(result.data.at(-1)).toMatchObject({ visitId: 'visit-0', summary: '최신-record-0' });
    expect(db.clinicalRecordVersion.groupBy).toHaveBeenCalledTimes(2);
    expect(db.clinicalRecordVersion.findMany).toHaveBeenCalledTimes(2);
    const batches = db.clinicalRecordVersion.groupBy.mock.calls.map(([q]) => q.where.recordId.in);
    expect(batches.map((b) => b.length)).toEqual([1000, 1]);
    expect(batches.flat()).not.toContain('record-1001');
    const firstQuery = db.visit.findMany.mock.calls[0]?.[0] as {
      select: { clinicalRecord: { select: Record<string, unknown> } };
    };
    expect(firstQuery.select.clinicalRecord.select).not.toHaveProperty('versions');
  });
  it('반환할 완료 진료의 버전이 없으면 기존 충돌 오류를 유지한다', async () => {
    const department = { id: 'department', name: '내과', status: 'ACTIVE' };
    const db = {
      patient: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'patient',
          patientNumber: 'number',
          name: '가상',
          birthDate: new Date('2000-01-01Z'),
          phone: '0000000',
        }),
      },
      visit: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'visit',
            receptionId: 'reception',
            completedAt: new Date('2030-01-01Z'),
            clinicalRecord: { id: 'record' },
            reception: {
              department,
              doctor: { accountId: 'doctor', account: { name: '의사' }, department },
            },
          },
        ]),
      },
      clinicalRecordVersion: { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn() },
    };
    vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
      db as unknown as ReturnType<typeof dbConfig.getPrismaClient>,
    );
    const actor: AccountContext = {
      id: 'doctor',
      role: 'DOCTOR',
      status: 'ACTIVE',
      departmentId: 'department',
    };
    await expect(getClinicalHistory('patient', actor, { limit: 20 })).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
    });
    expect(db.clinicalRecordVersion.findMany).not.toHaveBeenCalled();
  });
});
