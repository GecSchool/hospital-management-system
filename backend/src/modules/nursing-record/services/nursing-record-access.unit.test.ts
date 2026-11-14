import { afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { getNursingRecord, getNursingVersion } from './nursing-record-query.service.js';

afterEach(() => vi.restoreAllMocks());

describe('권한이 없는 간호 기록 접근', () => {
  it.each(['상세', '버전'] as const)(
    '%s 요청은 본문을 조회하기 전에 타과 접근을 거부한다',
    async (mode) => {
      const db = {
        nursingRecord: {
          findUnique: vi.fn().mockResolvedValue({ id: 'record', receptionId: 'reception' }),
        },
        reception: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ patientId: 'patient', departmentId: 'other-department' }),
        },
        nursingRecordVersion: { findUnique: vi.fn() },
      };
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        db as unknown as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const nurse: AccountContext = {
        id: 'nurse',
        role: 'NURSE',
        status: 'ACTIVE',
        departmentId: 'my-department',
      };
      const result =
        mode === '상세' ? getNursingRecord(nurse, 'record') : getNursingVersion(nurse, 'record', 1);
      await expect(result).rejects.toMatchObject({ status: 403 });
      expect(db.nursingRecord.findUnique).toHaveBeenCalledTimes(1);
      expect(db.nursingRecord.findUnique).toHaveBeenCalledWith({
        where: { id: 'record' },
        select: { id: true, receptionId: true },
      });
      expect(db.nursingRecordVersion.findUnique).not.toHaveBeenCalled();
    },
  );

  it.each(['상세', '버전'] as const)(
    '%s 요청은 담당 환자가 아닌 의사에게 본문 조회 전 거부한다',
    async (mode) => {
      const db = {
        nursingRecord: {
          findUnique: vi.fn().mockResolvedValue({ id: 'record', receptionId: 'reception' }),
        },
        reception: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ patientId: 'patient', departmentId: 'department' }),
        },
        patient: { findFirst: vi.fn().mockResolvedValue(null) },
        nursingRecordVersion: { findUnique: vi.fn() },
      };
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        db as unknown as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const doctor: AccountContext = {
        id: 'doctor',
        role: 'DOCTOR',
        status: 'ACTIVE',
        departmentId: 'department',
      };
      const result =
        mode === '상세'
          ? getNursingRecord(doctor, 'record')
          : getNursingVersion(doctor, 'record', 1);
      await expect(result).rejects.toMatchObject({ status: 403 });
      expect(db.nursingRecord.findUnique).toHaveBeenCalledTimes(1);
      expect(db.nursingRecord.findUnique).toHaveBeenCalledWith({
        where: { id: 'record' },
        select: { id: true, receptionId: true },
      });
      expect(db.nursingRecordVersion.findUnique).not.toHaveBeenCalled();
    },
  );
});
