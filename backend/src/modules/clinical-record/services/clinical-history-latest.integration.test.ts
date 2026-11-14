import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../../../generated/prisma/client.js';
import * as dbConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { getClinicalHistory } from './clinical-history.service.js';
import { decodeCursor } from '../../../common/utils/cursor.js';
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
  log: [{ emit: 'event', level: 'query' }],
});
const writer = dbConfig.createPrismaClient(testDatabaseUrl());
let capturing = false;
let diagnosisQueries: { sql: string; params: string }[] = [];
prisma.$on('query', (e) => {
  if (capturing && /clinical_record_versions/i.test(e.query) && /"diagnosis"/i.test(e.query))
    diagnosisQueries.push({ sql: e.query, params: e.params });
});
afterAll(async () => {
  await Promise.all([prisma.$disconnect(), writer.$disconnect()]);
});
afterEach(() => {
  capturing = false;
  diagnosisQueries = [];
  vi.restoreAllMocks();
});

describe('진료 이력 페이지의 최신 진단만 조회', () => {
  it('실제 SQL은 반환할 페이지의 복합키만 사용하며 추가 행의 진단은 가져오지 않는다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const actor = {
        id: f.doctor.id,
        role: 'DOCTOR' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      const visitIds = ['a', 'b', 'c'].map((prefix) => `${prefix}-${f.admin.id}`);
      const recordIds: string[] = [];
      const at = new Date('2030-01-01T00:00:00Z');
      for (let i = 0; i < 3; i++) {
        const reception = await tx.reception.create({
          data: {
            patientId: f.patient.id,
            doctorAccountId: f.doctor.id,
            departmentId: f.department.id,
          },
        });
        const visit = await tx.visit.create({
          data: {
            id: visitIds[i],
            receptionId: reception.id,
            status: 'COMPLETED',
            startedAt: at,
            completedAt: at,
          },
        });
        const record = await tx.clinicalRecord.create({ data: { visitId: visit.id } });
        recordIds.push(record.id);
        for (let v = 1; v <= 8; v++)
          await tx.clinicalRecordVersion.create({
            data: {
              recordId: record.id,
              versionNo: v,
              symptoms: '가상 증상',
              diagnosis: `진단-${i}-${v}`,
              opinion: '가상 소견',
              correctionReason: v === 1 ? null : '가상 정정',
              authorAccountId: f.doctor.id,
            },
          });
      }
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      diagnosisQueries = [];
      capturing = true;
      const first = await getClinicalHistory(f.patient.id, actor, { limit: 2 });
      capturing = false;
      expect(first.data.map((x) => x.visitId)).toEqual(visitIds.slice(1));
      expect(first.data.map((x) => x.summary)).toEqual(['진단-1-8', '진단-2-8']);
      expect(first.meta.hasMore).toBe(true);
      expect(diagnosisQueries.length).toBe(1);
      const q = diagnosisQueries[0];
      const params: unknown[] = JSON.parse(q.params);
      // 실패하더라도 SQL·매개변수 전체가 테스트 로그에 출력되지 않도록 불리언만 비교한다.
      expect(
        /"record_id"\s*=\s*\$\d+/i.test(q.sql) && /"version_no"\s*=\s*\$\d+/i.test(q.sql),
      ).toBe(true);
      expect(
        [recordIds[1], recordIds[2]].every((id) => {
          const i = params.indexOf(id);
          return i >= 0 && Number(params[i + 1]) === 8;
        }),
      ).toBe(true);
      expect(params.includes(recordIds[0])).toBe(false);
      // 같은 격리 트랜잭션에서 캡처한 진단 SELECT를 재실행하여 DB가 반환한 행 수만 확인한다.
      const selectedRows = await tx.$queryRawUnsafe<unknown[]>(q.sql, ...params);
      expect(selectedRows.length).toBe(2);
      const second = await getClinicalHistory(f.patient.id, actor, {
        limit: 2,
        before: decodeCursor(first.meta.nextBefore!),
      });
      expect(second.data.map((x) => x.visitId)).toEqual(visitIds.slice(0, 1));
      expect(second.meta).toEqual({ nextBefore: null, hasMore: false });
    });
  });
  it('실제 PostgreSQL에서 1001건 페이지의 진단 바인딩을 1000건 단위로 분리한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const actor = {
        id: f.doctor.id,
        role: 'DOCTOR' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      const prefix = `batch-${f.admin.id}`;
      const at = new Date('2030-01-01T00:00:00Z');
      const ids = Array.from({ length: 1002 }, (_, i) => `${prefix}-${String(i).padStart(4, '0')}`);
      await tx.reception.createMany({
        data: ids.map((id) => ({
          id: `r-${id}`,
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        })),
      });
      await tx.visit.createMany({
        data: ids.map((id) => ({
          id: `v-${id}`,
          receptionId: `r-${id}`,
          status: 'COMPLETED' as const,
          startedAt: at,
          completedAt: at,
        })),
      });
      await tx.clinicalRecord.createMany({
        data: ids.map((id) => ({ id: `c-${id}`, visitId: `v-${id}` })),
      });
      await tx.clinicalRecordVersion.createMany({
        data: ids.map((id) => ({
          recordId: `c-${id}`,
          versionNo: 1,
          symptoms: '가상',
          diagnosis: '진단',
          opinion: '가상',
          authorAccountId: f.doctor.id,
        })),
      });
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      diagnosisQueries = [];
      capturing = true;
      const result = await getClinicalHistory(f.patient.id, actor, { limit: 1001 });
      capturing = false;
      expect(result.data).toHaveLength(1001);
      expect(result.meta.hasMore).toBe(true);
      expect(diagnosisQueries.length).toBe(2);
      const paramCounts = diagnosisQueries.map((q) => (JSON.parse(q.params) as unknown[]).length);
      expect(paramCounts.every((count) => count <= 2010)).toBe(true);
      expect(
        diagnosisQueries.some((q) => (JSON.parse(q.params) as unknown[]).includes(`c-${ids[0]}`)),
      ).toBe(false);
    });
  });
  it('최신 버전 번호 조회 직후 다른 연결에서 정정해도 선택한 버전의 진단을 반환한다', async () => {
    const f = await createMedicalStaffFixture(prisma);
    let recordId: string | undefined;
    try {
      const reception = await prisma.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      const at = new Date('2030-01-01T00:00:00Z');
      const visit = await prisma.visit.create({
        data: { receptionId: reception.id, status: 'COMPLETED', startedAt: at, completedAt: at },
      });
      const record = await prisma.clinicalRecord.create({ data: { visitId: visit.id } });
      recordId = record.id;
      await prisma.clinicalRecordVersion.create({
        data: {
          recordId: record.id,
          versionNo: 1,
          symptoms: '가상',
          diagnosis: '원본 진단',
          opinion: '가상',
          authorAccountId: f.doctor.id,
        },
      });
      let interleaved = false;
      const delegate = prisma.clinicalRecordVersion;
      const versionProxy = new Proxy(delegate, {
        get(target, key, receiver) {
          if (key === 'groupBy')
            return async (...args: Parameters<typeof delegate.groupBy>) => {
              const result = await delegate.groupBy(...args);
              if (!interleaved) {
                interleaved = true;
                await writer.clinicalRecordVersion.create({
                  data: {
                    recordId: record.id,
                    versionNo: 2,
                    symptoms: '가상',
                    diagnosis: '동시 정정 진단',
                    opinion: '가상',
                    correctionReason: '가상 정정',
                    authorAccountId: f.doctor.id,
                  },
                });
              }
              return result;
            };
          return Reflect.get(target, key, receiver);
        },
      });
      const wrapped = new Proxy(prisma, {
        get(target, key, receiver) {
          if (key === 'clinicalRecordVersion') return versionProxy;
          return Reflect.get(target, key, receiver);
        },
      });
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(wrapped);
      const actor = {
        id: f.doctor.id,
        role: 'DOCTOR' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      const result = await getClinicalHistory(f.patient.id, actor, { limit: 1 });
      expect(interleaved).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].summary).toBe('원본 진단');
      const current = await prisma.clinicalRecordVersion.findUniqueOrThrow({
        where: { recordId_versionNo: { recordId: record.id, versionNo: 2 } },
      });
      expect(current.diagnosis).toBe('동시 정정 진단');
    } finally {
      if (recordId) {
        await prisma.clinicalRecordVersion.deleteMany({ where: { recordId } });
        await prisma.clinicalRecord.deleteMany({ where: { id: recordId } });
      }
      await prisma.visit.deleteMany({ where: { reception: { patientId: f.patient.id } } });
      await prisma.reception.deleteMany({ where: { patientId: f.patient.id } });
      await prisma.doctor.deleteMany({ where: { accountId: f.doctor.id } });
      await prisma.nurse.deleteMany({ where: { accountId: f.nurse.id } });
      await prisma.patient.deleteMany({ where: { id: f.patient.id } });
      await prisma.account.deleteMany({
        where: { id: { in: [f.admin.id, f.doctor.id, f.nurse.id] } },
      });
      await prisma.department.deleteMany({
        where: { id: { in: [f.department.id, f.otherDepartment.id, f.inactiveDepartment.id] } },
      });
    }
  });
});
