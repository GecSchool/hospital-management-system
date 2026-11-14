import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client.js';
import * as db from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { getClinicalRecord, getClinicalVersion } from './clinical-record-query.service.js';

const queries: string[] = [];
let collecting = false;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
  log: [{ level: 'query', emit: 'event' }],
});
prisma.$on('query', (event) => {
  if (collecting) queries.push(event.query);
});
afterAll(() => prisma.$disconnect());
afterEach(() => {
  collecting = false;
  queries.length = 0;
  vi.restoreAllMocks();
});

describe('진료 기록 상세의 버전 조회 투영', () => {
  it('메타 조회는 본문을 읽지 않고 최신 본문 하나만 읽되 응답과 과거 버전을 유지한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const reception = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      const visit = await tx.visit.create({
        data: {
          receptionId: reception.id,
          status: 'COMPLETED',
          startedAt: new Date('2026-01-01T00:00:00Z'),
          completedAt: new Date('2026-01-01T01:00:00Z'),
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
                diagnosis: '원본 진단',
                opinion: '원본 소견',
                authorAccountId: f.doctor.id,
              },
              {
                versionNo: 2,
                symptoms: '정정 증상',
                diagnosis: '정정 진단',
                opinion: '정정 소견',
                correctionReason: '정정',
                authorAccountId: f.doctor.id,
              },
            ],
          },
        },
      });
      const actor = {
        id: f.doctor.id,
        role: 'DOCTOR' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      vi.spyOn(db, 'getPrismaClient').mockReturnValue(tx as ReturnType<typeof db.getPrismaClient>);
      collecting = true;
      const result = await getClinicalRecord(record.id, actor);
      collecting = false;
      expect(result.latestVersion).toMatchObject({
        versionNo: 2,
        symptoms: '정정 증상',
        diagnosis: '정정 진단',
        opinion: '정정 소견',
      });
      expect(result.versions.map((v) => v.versionNo)).toEqual([1, 2]);
      expect(result.versions[0]).not.toHaveProperty('symptoms');
      const versionQueries = queries.filter(
        (q) => /^\s*select\b/i.test(q) && q.includes('"clinical_record_versions"'),
      );
      expect(versionQueries).toHaveLength(2);
      const [metadata, latest] = versionQueries;
      for (const field of ['symptoms', 'diagnosis', 'opinion', 'correction_reason'])
        expect(metadata).not.toContain(`"${field}"`);
      for (const field of ['symptoms', 'diagnosis', 'opinion', 'correction_reason'])
        expect(latest).toContain(`"${field}"`);
      expect(latest).toMatch(/"record_id"\s*=/);
      expect(latest).toMatch(/"version_no"\s*=/);
      expect(await getClinicalVersion(record.id, 1, actor)).toMatchObject({
        versionNo: 1,
        symptoms: '원본 증상',
      });
      await expect(
        getClinicalRecord(record.id, { ...actor, id: 'unauthorized' }),
      ).rejects.toMatchObject({ status: 403 });
    });
  });
});
