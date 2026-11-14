import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { listDoctorPatients } from './doctor-patients.service.js';
import { parseDoctorPatientsQuery } from '../validations/doctor-patients.validation.js';
const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());
describe('의사 환자 목록', () => {
  it('미접수는 예약 시각, 접수는 접수 시각 기준으로 날짜·상태를 적용하며 중복을 제거한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const base = {
        patientId: f.patient.id,
        doctorAccountId: f.doctor.id,
        departmentId: f.department.id,
      };
      const appointment = await tx.appointment.create({
        data: {
          ...base,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2030-01-01T09:00:00+09:00'),
        },
      });
      const received = await tx.appointment.create({
        data: {
          ...base,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2030-01-01T10:00:00+09:00'),
        },
      });
      const reception = await tx.reception.create({
        data: {
          ...base,
          appointmentId: received.id,
          receivedAt: new Date('2030-01-01T09:10:00+09:00'),
          status: 'CALLED',
        },
      });
      const visit = await tx.visit.create({
        data: { receptionId: reception.id, startedAt: new Date('2030-01-01T09:11:00+09:00') },
      });
      const record = await tx.clinicalRecord.create({ data: { visitId: visit.id } });
      const walkin = await tx.reception.create({
        data: { ...base, receivedAt: new Date('2030-01-01T09:20:00+09:00') },
      });
      await tx.reception.create({
        data: { ...base, receivedAt: new Date('2029-12-31T23:59:59+09:00') },
      });
      const actor = {
        id: f.doctor.id,
        role: 'DOCTOR' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      const rows = await listDoctorPatients(
        actor,
        parseDoctorPatientsQuery({ date: '2030-01-01' }),
      );
      expect(rows).toHaveLength(3);
      expect(rows[0]).toMatchObject({
        appointmentId: appointment.id,
        displayStatus: 'BOOKED',
        displayTime: '2030-01-01T00:00:00.000Z',
      });
      expect(rows[1]).toMatchObject({
        appointmentId: received.id,
        receptionId: reception.id,
        visitId: visit.id,
        clinicalRecordId: record.id,
        displayStatus: 'IN_PROGRESS',
        displayTime: '2030-01-01T00:10:00.000Z',
      });
      expect(rows[2]).toMatchObject({ receptionId: walkin.id, displayStatus: 'REGISTERED' });
      expect((rows[0] as { patient: unknown }).patient).not.toHaveProperty('patientNumber');
      expect(
        await listDoctorPatients(
          actor,
          parseDoctorPatientsQuery({ date: '2030-01-01', status: 'IN_PROGRESS' }),
        ),
      ).toHaveLength(1);
      expect(
        await listDoctorPatients(actor, parseDoctorPatientsQuery({ date: '2030-01-02' })),
      ).toHaveLength(0);
      await expect(
        listDoctorPatients(
          { ...actor, role: 'STAFF' },
          parseDoctorPatientsQuery({ date: '2030-01-01' }),
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(
        await listDoctorPatients(
          { ...actor, id: 'other' },
          parseDoctorPatientsQuery({ date: '2030-01-01' }),
        ),
      ).toHaveLength(0);
    });
  });
  it('날짜와 화면 상태를 검증한다', () => {
    expect(() => parseDoctorPatientsQuery({})).toThrow();
    expect(() => parseDoctorPatientsQuery({ date: '2030-02-30' })).toThrow();
    expect(() => parseDoctorPatientsQuery({ date: '2030-01-01', status: 'WRONG' })).toThrow();
  });
});
