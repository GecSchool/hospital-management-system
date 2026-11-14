import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../../../generated/prisma/client.js';
import * as dbConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { decodeCursor } from '../../../common/utils/cursor.js';
import { listNursingRecords } from './nursing-record-query.service.js';
import { getNursingHistory } from './nursing-history.service.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
  log: [{ emit: 'event', level: 'query' }],
});
let capturing = false;
let contentQueries: { sql: string; params: string }[] = [];
prisma.$on('query', (e) => {
  if (capturing && /nursing_record_versions/i.test(e.query) && /"content"/i.test(e.query))
    contentQueries.push({ sql: e.query, params: e.params });
});
afterAll(() => prisma.$disconnect());
afterEach(() => {
  capturing = false;
  contentQueries = [];
  vi.restoreAllMocks();
});
function expectOnlyLatestVersionQuery(included: [string, number][], excluded: string) {
  expect(contentQueries).toHaveLength(1);
  const { sql, params } = contentQueries[0];
  const values: unknown[] = JSON.parse(params);
  for (const [id, versionNo] of included) {
    const index = values.indexOf(id);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(Number(values[index + 1])).toBe(versionNo);
  }
  expect(values).not.toContain(excluded);
  expect(sql).toMatch(/"record_id"\s*=\s*\$\d+/i);
  expect(sql).toMatch(/"version_no"\s*=\s*\$\d+/i);
  expect(sql).not.toMatch(/"record_id"\s+IN\s*\(/i);
}
describe('간호 목록: 페이지의 최신 본문만 묶어 조회', () => {
  it('두 목록의 원본 시각·작성자·정정·커서를 유지하며 이전 버전 본문은 읽지 않는다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const nurse2 = await tx.account.create({
        data: {
          email: `list-other-${f.admin.id}@example.test`,
          name: '가상 간호사',
          role: 'NURSE',
          passwordHash: 'test',
          nurse: { create: { departmentId: f.department.id } },
        },
      });
      const reception = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      const ids = ['a', 'b', 'c'].map((x) => `${x}-${f.admin.id}`);
      const at = new Date('2030-01-01T00:00:00Z');
      for (let i = 0; i < 3; i++) {
        await tx.nursingRecord.create({
          data: {
            id: ids[i],
            receptionId: reception.id,
            originalAuthorAccountId: f.nurse.id,
            versions: {
              create: [
                { versionNo: 1, content: `원본-${i}`, authorAccountId: f.nurse.id, createdAt: at },
                ...(i === 2
                  ? [
                      {
                        versionNo: 2,
                        content: '중간',
                        correctionReason: '정정',
                        authorAccountId: f.nurse.id,
                      },
                      {
                        versionNo: 3,
                        content: '최신',
                        correctionReason: '보완',
                        authorAccountId: nurse2.id,
                      },
                    ]
                  : []),
              ],
            },
          },
        });
      }
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as unknown as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const actor = {
        id: f.nurse.id,
        role: 'NURSE' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      capturing = true;
      contentQueries = [];
      const first = await listNursingRecords(actor, reception.id, { limit: 2 });
      capturing = false;
      expect(first.data.map((x) => x.id)).toEqual(ids.slice(1));
      expect(first.meta.hasMore).toBe(true);
      expect(first.data[1]).toMatchObject({
        id: ids[2],
        createdAt: at.toISOString(),
        author: { id: f.nurse.id },
        latestVersion: { versionNo: 3, content: '최신', author: { id: nurse2.id } },
      });
      expectOnlyLatestVersionQuery(
        [
          [ids[1], 1],
          [ids[2], 3],
        ],
        ids[0],
      );
      const older = await listNursingRecords(actor, reception.id, {
        limit: 2,
        before: decodeCursor(first.meta.nextBefore!),
      });
      expect(older.data.map((x) => x.id)).toEqual(ids.slice(0, 1));
      expect(older.meta).toEqual({ nextBefore: null, hasMore: false });
      capturing = true;
      contentQueries = [];
      const history = await getNursingHistory(f.patient.id, actor, {
        receptionId: reception.id,
        limit: 2,
      });
      capturing = false;
      expect(history.data.map((x) => x.id)).toEqual(ids.slice(1));
      expect(history.data[1].latestVersion.author.id).toBe(nurse2.id);
      expectOnlyLatestVersionQuery(
        [
          [ids[1], 1],
          [ids[2], 3],
        ],
        ids[0],
      );
      capturing = true;
      contentQueries = [];
      await expect(
        listNursingRecords({ ...actor, departmentId: f.otherDepartment.id }, reception.id, {
          limit: 2,
        }),
      ).rejects.toMatchObject({ status: 403 });
      capturing = false;
      expect(contentQueries).toEqual([]);
    });
  });
  it('빈 페이지는 본문을 조회하지 않고 두 목록이 빈 결과를 반환한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const reception = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as unknown as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const actor = {
        id: f.nurse.id,
        role: 'NURSE' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      capturing = true;
      contentQueries = [];
      const byReception = await listNursingRecords(actor, reception.id, { limit: 2 });
      const byPatient = await getNursingHistory(f.patient.id, actor, {
        receptionId: reception.id,
        limit: 2,
      });
      capturing = false;
      expect(byReception).toEqual({ data: [], meta: { nextBefore: null, hasMore: false } });
      expect(byPatient).toEqual({ data: [], meta: { nextBefore: null, hasMore: false } });
      expect(contentQueries).toEqual([]);
    });
  });
  it('최신 번호 집계 직후 정정이 추가돼도 집계 시점 버전을 온전하게 반환하고 다음 조회는 새 버전을 본다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const reception = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      const record = await tx.nursingRecord.create({
        data: {
          receptionId: reception.id,
          originalAuthorAccountId: f.nurse.id,
          versions: { create: { versionNo: 1, content: '원본', authorAccountId: f.nurse.id } },
        },
      });
      const actor = {
        id: f.nurse.id,
        role: 'NURSE' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      const delegate = new Proxy(tx.nursingRecordVersion, {
        get(target, key, receiver) {
          if (key === 'groupBy')
            return async (...args: unknown[]) => {
              const grouped = await (target.groupBy as (...args: unknown[]) => Promise<unknown>)(
                ...args,
              );
              await target.create({
                data: {
                  recordId: record.id,
                  versionNo: 2,
                  content: '추가 정정',
                  correctionReason: '확인',
                  authorAccountId: f.nurse.id,
                },
              });
              return grouped;
            };
          return Reflect.get(target, key, receiver);
        },
      });
      const interleaved = new Proxy(tx, {
        get(target, key, receiver) {
          return key === 'nursingRecordVersion' ? delegate : Reflect.get(target, key, receiver);
        },
      });
      const spy = vi
        .spyOn(dbConfig, 'getPrismaClient')
        .mockReturnValue(interleaved as unknown as ReturnType<typeof dbConfig.getPrismaClient>);
      const before = await listNursingRecords(actor, reception.id, { limit: 10 });
      expect(before.data[0].latestVersion).toMatchObject({ versionNo: 1, content: '원본' });
      spy.mockReturnValue(tx as unknown as ReturnType<typeof dbConfig.getPrismaClient>);
      const after = await getNursingHistory(f.patient.id, actor, {
        receptionId: reception.id,
        limit: 10,
      });
      expect(after.data[0].latestVersion).toMatchObject({ versionNo: 2, content: '추가 정정' });
    });
  });
  it('목록 집계와 본문 조회 사이 별도 연결의 정정 커밋이 있어도 읽은 버전은 보존된다', async () => {
    const f = await createMedicalStaffFixture(prisma);
    let release: () => void = () => {};
    let pending: Promise<unknown> | undefined;
    try {
      const reception = await prisma.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      const record = await prisma.nursingRecord.create({
        data: {
          receptionId: reception.id,
          originalAuthorAccountId: f.nurse.id,
          versions: { create: { versionNo: 1, content: '원본', authorAccountId: f.nurse.id } },
        },
      });
      const actor = {
        id: f.nurse.id,
        role: 'NURSE' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      let reached!: () => void;
      const groupedReached = new Promise<void>((resolve) => {
        reached = resolve;
      });
      const proceed = new Promise<void>((resolve) => {
        release = resolve;
      });
      const delegate = new Proxy(prisma.nursingRecordVersion, {
        get(target, key, receiver) {
          if (key === 'groupBy')
            return async (...args: unknown[]) => {
              const grouped = await (target.groupBy as (...args: unknown[]) => Promise<unknown>)(
                ...args,
              );
              reached();
              await proceed;
              return grouped;
            };
          return Reflect.get(target, key, receiver);
        },
      });
      const interleaved = new Proxy(prisma, {
        get(target, key, receiver) {
          return key === 'nursingRecordVersion' ? delegate : Reflect.get(target, key, receiver);
        },
      });
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        interleaved as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const request = listNursingRecords(actor, reception.id, { limit: 10 });
      pending = request;
      await Promise.race([
        groupedReached,
        request.then(() => {
          throw new Error('groupBy was not intercepted');
        }),
      ]);
      await prisma.nursingRecordVersion.create({
        data: {
          recordId: record.id,
          versionNo: 2,
          content: '별도 연결의 정정',
          correctionReason: '확인',
          authorAccountId: f.nurse.id,
        },
      });
      release();
      const first = await request;
      expect(first.data[0].latestVersion).toMatchObject({ versionNo: 1, content: '원본' });
      vi.mocked(dbConfig.getPrismaClient).mockReturnValue(prisma);
      const next = await listNursingRecords(actor, reception.id, { limit: 10 });
      expect(next.data[0].latestVersion).toMatchObject({
        versionNo: 2,
        content: '별도 연결의 정정',
      });
    } finally {
      release();
      if (pending) await pending.catch(() => {});
      const records = await prisma.nursingRecord.findMany({
        where: { reception: { patientId: f.patient.id } },
        select: { id: true },
      });
      await prisma.nursingRecordVersion.deleteMany({
        where: { recordId: { in: records.map((r) => r.id) } },
      });
      await prisma.nursingRecord.deleteMany({ where: { id: { in: records.map((r) => r.id) } } });
      await prisma.reception.deleteMany({ where: { patientId: f.patient.id } });
      await prisma.patient.deleteMany({ where: { id: f.patient.id } });
      await prisma.doctor.deleteMany({ where: { accountId: f.doctor.id } });
      await prisma.nurse.deleteMany({ where: { accountId: f.nurse.id } });
      await prisma.account.deleteMany({
        where: { id: { in: [f.admin.id, f.doctor.id, f.nurse.id] } },
      });
      await prisma.department.deleteMany({
        where: { id: { in: [f.department.id, f.otherDepartment.id, f.inactiveDepartment.id] } },
      });
    }
  });
  it('큰 페이지도 최신 본문 SQL의 바인딩 수를 제한하면서 원래 순서로 모두 반환한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const reception = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      const ids = Array.from(
        { length: 1001 },
        (_, i) => `batch-${String(i).padStart(4, '0')}-${f.admin.id}`,
      );
      const at = new Date('2030-01-01T00:00:00Z');
      await tx.nursingRecord.createMany({
        data: ids.map((id) => ({
          id,
          receptionId: reception.id,
          originalAuthorAccountId: f.nurse.id,
        })),
      });
      await tx.nursingRecordVersion.createMany({
        data: ids.map((recordId) => ({
          recordId,
          versionNo: 1,
          content: '가상 기록',
          authorAccountId: f.nurse.id,
          createdAt: at,
        })),
      });
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as unknown as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const actor = {
        id: f.nurse.id,
        role: 'NURSE' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      capturing = true;
      contentQueries = [];
      const result = await listNursingRecords(actor, reception.id, { limit: 1001 });
      capturing = false;
      expect(result.data.map((x) => x.id)).toEqual(ids);
      expect(result.meta).toEqual({ nextBefore: null, hasMore: false });
      expect(contentQueries.length).toBeGreaterThan(1);
      const selected: string[] = [];
      for (const query of contentQueries) {
        const values: unknown[] = JSON.parse(query.params);
        expect(values.length).toBeLessThanOrEqual(2001);
        selected.push(
          ...values.filter((v): v is string => typeof v === 'string' && v.startsWith('batch-')),
        );
      }
      expect(selected.sort()).toEqual(ids);
    });
  });
});
