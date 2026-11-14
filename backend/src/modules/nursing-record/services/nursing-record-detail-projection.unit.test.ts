import { afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { getNursingRecord } from './nursing-record-query.service.js';

afterEach(() => vi.restoreAllMocks());

describe('간호 기록 상세의 본문 최소 조회', () => {
  it('모든 버전의 요약과 최신 본문을 반환하면서 과거 본문을 읽지 않는다', async () => {
    const account = {
      id: 'nurse',
      name: '간호사',
      email: 'nurse@example.test',
      role: 'NURSE',
      status: 'ACTIVE',
      doctor: null,
      nurse: { department: { id: 'department', name: '내과', status: 'ACTIVE' } },
    };
    const versions = [1, 2, 3].map((versionNo) => ({
      recordId: 'record',
      versionNo,
      content: `기록 ${versionNo}`,
      correctionReason: versionNo === 1 ? null : `정정 사유 ${versionNo}`,
      createdAt: new Date(`2030-01-0${versionNo}T00:00:00Z`),
      author: { account },
    }));
    const db = {
      nursingRecord: {
        findUnique: vi.fn(async (query: { select?: { versions?: unknown } }) =>
          query.select?.versions
            ? { id: 'record', receptionId: 'reception', versions }
            : { id: 'record', receptionId: 'reception' },
        ),
      },
      reception: {
        findUnique: vi.fn().mockResolvedValue({ patientId: 'patient', departmentId: 'department' }),
      },
      nursingRecordVersion: {
        findMany: vi
          .fn()
          .mockImplementation(async () =>
            versions.map(({ versionNo, author, createdAt }) => ({ versionNo, author, createdAt })),
          ),
        findUnique: vi
          .fn()
          .mockImplementation(
            async (query: { where: { recordId_versionNo: { versionNo: number } } }) =>
              versions.find((v) => v.versionNo === query.where.recordId_versionNo.versionNo) ??
              null,
          ),
      },
    };
    vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
      db as unknown as ReturnType<typeof dbConfig.getPrismaClient>,
    );
    const actor: AccountContext = {
      id: 'nurse',
      role: 'NURSE',
      status: 'ACTIVE',
      departmentId: 'department',
    };
    const result = await getNursingRecord(actor, 'record');
    expect(result.versions.map((v) => v.versionNo)).toEqual([1, 2, 3]);
    expect(result.versions.every((v) => !('content' in v) && !('correctionReason' in v))).toBe(
      true,
    );
    expect(result.latestVersion).toMatchObject({
      recordId: 'record',
      versionNo: 3,
      content: '기록 3',
      correctionReason: '정정 사유 3',
      author: { id: 'nurse' },
    });
    const recordSelects = db.nursingRecord.findUnique.mock.calls.map(([q]) => q.select);
    expect(
      recordSelects.some((s) =>
        Boolean((s?.versions as { select?: { content?: unknown } } | undefined)?.select?.content),
      ),
    ).toBe(false);
    expect(db.nursingRecordVersion.findMany).toHaveBeenCalledOnce();
    const metadataQuery = db.nursingRecordVersion.findMany.mock.calls[0]?.[0] as {
      select?: Record<string, unknown>;
    };
    expect(metadataQuery.select).toMatchObject({
      versionNo: true,
      createdAt: true,
      author: expect.any(Object),
    });
    expect(metadataQuery.select?.content).not.toBe(true);
    expect(metadataQuery.select?.correctionReason).not.toBe(true);
    expect(db.nursingRecordVersion.findUnique).toHaveBeenCalledOnce();
    expect(db.nursingRecordVersion.findUnique.mock.calls[0]?.[0]).toMatchObject({
      where: { recordId_versionNo: { recordId: 'record', versionNo: 3 } },
    });
  });

  it.each(['no-versions', 'missing-body'] as const)(
    '버전이 정합하지 않은 %s 상황은 충돌 오류를 반환한다',
    async (condition) => {
      const account = {
        id: 'nurse',
        name: '간호사',
        email: 'nurse@example.test',
        role: 'NURSE',
        status: 'ACTIVE',
        doctor: null,
        nurse: { department: { id: 'department', name: '내과', status: 'ACTIVE' } },
      };
      const db = {
        nursingRecord: {
          findUnique: vi.fn().mockResolvedValue({ id: 'record', receptionId: 'reception' }),
        },
        reception: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ patientId: 'patient', departmentId: 'department' }),
        },
        nursingRecordVersion: {
          findMany: vi.fn().mockResolvedValue(
            condition === 'no-versions'
              ? []
              : [
                  {
                    versionNo: 1,
                    createdAt: new Date('2030-01-01T00:00:00Z'),
                    author: { account },
                  },
                ],
          ),
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        db as unknown as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const actor: AccountContext = {
        id: 'nurse',
        role: 'NURSE',
        status: 'ACTIVE',
        departmentId: 'department',
      };
      await expect(getNursingRecord(actor, 'record')).rejects.toMatchObject({
        status: 409,
        code: 'CONFLICT',
      });
      if (condition === 'no-versions')
        expect(db.nursingRecordVersion.findUnique).not.toHaveBeenCalled();
    },
  );
});
