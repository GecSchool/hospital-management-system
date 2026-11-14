import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { getNursingRecord } from './nursing-record-query.service.js';

const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
// 조회와 삽입이 서로 다른 커넥션 풀을 쓰도록 별도의 클라이언트를 생성한다.
const writer = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(async () => {
  await Promise.all([prisma.$disconnect(), writer.$disconnect()]);
});
afterEach(() => vi.restoreAllMocks());

describe('간호 기록 상세 조회와 동시 정정', () => {
  it('버전 요약을 읽은 직후 새 정정이 커밋돼도 최신 본문과 요약 목록은 일치한다', async () => {
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
      const record = await prisma.nursingRecord.create({
        data: { receptionId: reception.id, originalAuthorAccountId: f.nurse.id },
      });
      recordId = record.id;
      for (const versionNo of [1, 2]) {
        await prisma.nursingRecordVersion.create({
          data: {
            recordId,
            versionNo,
            content: `내용 ${versionNo}`,
            correctionReason: versionNo === 1 ? null : '두 번째 버전',
            authorAccountId: f.nurse.id,
          },
        });
      }
      let insertedBetweenQueries = false;
      const delegate = prisma.nursingRecordVersion;
      const versionsProxy = new Proxy(delegate, {
        get(target, key, receiver) {
          if (key === 'findMany') {
            return async (...args: Parameters<typeof delegate.findMany>) => {
              const snapshot = await delegate.findMany(...args);
              if (!insertedBetweenQueries) {
                insertedBetweenQueries = true;
                await writer.nursingRecordVersion.create({
                  data: {
                    recordId: record.id,
                    versionNo: 3,
                    content: '동시에 추가된 내용',
                    correctionReason: '동시 정정',
                    authorAccountId: f.nurse.id,
                  },
                });
              }
              return snapshot;
            };
          }
          return Reflect.get(target, key, receiver);
        },
      });
      const wrapped = new Proxy(prisma, {
        get(target, key, receiver) {
          if (key === 'nursingRecordVersion') return versionsProxy;
          return Reflect.get(target, key, receiver);
        },
      });
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(wrapped);
      const nurse = {
        id: f.nurse.id,
        role: 'NURSE' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      const result = await getNursingRecord(nurse, record.id);
      expect(insertedBetweenQueries).toBe(true);
      expect(
        (
          await prisma.nursingRecordVersion.findUniqueOrThrow({
            where: { recordId_versionNo: { recordId: record.id, versionNo: 3 } },
          })
        ).content,
      ).toBe('동시에 추가된 내용');
      expect(result.versions.map((item) => item.versionNo)).toEqual([1, 2]);
      expect(result.latestVersion).toMatchObject({
        recordId: record.id,
        versionNo: 2,
        content: '내용 2',
        correctionReason: '두 번째 버전',
      });
      expect(result.latestVersion.versionNo).toBe(result.versions.at(-1)?.versionNo);
    } finally {
      if (recordId) {
        await prisma.nursingRecordVersion.deleteMany({ where: { recordId } });
        await prisma.nursingRecord.deleteMany({ where: { id: recordId } });
      }
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
