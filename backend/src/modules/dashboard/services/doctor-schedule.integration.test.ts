import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as dbConfig from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { getDoctorSchedule, getDoctorScheduleParts } from './doctor-schedule.service.js';
import { parseDoctorScheduleQuery } from '../validations/doctor-schedule.validation.js';

const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());

describe('의사 일정의 확정된 조회 항목', () => {
  it('날짜 범위가 필수이고 존재하는 날짜 및 정순인지 검사한다', () => {
    expect(parseDoctorScheduleQuery({ from: '2030-01-01', to: '2030-01-02' })).toEqual({
      from: '2030-01-01',
      to: '2030-01-02',
    });
    for (const q of [
      {},
      { from: '2030-02-30', to: '2030-03-01' },
      { from: '2030-01-02', to: '2030-01-01' },
    ])
      expect(() => parseDoctorScheduleQuery(q)).toThrow();
  });

  it('의사 본인의 일정만 서울 날짜 기준으로 조회하고 연결 ID와 상태를 제공한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const actor = {
        id: f.doctor.id,
        role: 'DOCTOR' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      await tx.doctorAvailability.createMany({
        data: [
          { doctorAccountId: f.doctor.id, dayOfWeek: 2, startMinute: 540, endMinute: 720 },
          { doctorAccountId: f.doctor.id, dayOfWeek: 2, startMinute: 720, endMinute: 780 },
        ],
      });
      await tx.doctorLeave.create({
        data: { doctorAccountId: f.doctor.id, date: new Date('2030-01-01T00:00:00Z') },
      });
      const fields = {
        patientId: f.patient.id,
        doctorAccountId: f.doctor.id,
        departmentId: f.department.id,
      };
      const anotherDoctor = await tx.account.create({
        data: {
          email: `other-${f.doctor.id}@example.test`,
          name: 'other doctor',
          role: 'DOCTOR',
          passwordHash: 'test',
          doctor: { create: { departmentId: f.department.id } },
        },
      });
      await tx.appointment.create({
        data: {
          ...fields,
          doctorAccountId: anotherDoctor.id,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2030-01-01T01:00:00Z'),
        },
      });
      await tx.reception.create({
        data: {
          ...fields,
          doctorAccountId: anotherDoctor.id,
          receivedAt: new Date('2030-01-01T01:00:00Z'),
        },
      });
      const appointment = await tx.appointment.create({
        data: {
          ...fields,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2029-12-31T15:00:00Z'),
        },
      });
      const reception = await tx.reception.create({
        data: {
          ...fields,
          appointmentId: appointment.id,
          receivedAt: new Date('2030-01-01T14:59:59Z'),
        },
      });
      await tx.appointment.create({
        data: {
          ...fields,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2030-01-01T15:00:00Z'),
        },
      });
      const result = await getDoctorScheduleParts(actor, '2030-01-01', '2030-01-01');
      expect(result.availability).toEqual([{ dayOfWeek: 2, startTime: '09:00', endTime: '13:00' }]);
      expect(result.leaves).toEqual([{ date: '2030-01-01' }]);
      expect(result.appointments).toHaveLength(1);
      expect(result.appointments[0]).toMatchObject({
        id: appointment.id,
        receptionId: reception.id,
        displayStatus: 'REGISTERED',
      });
      expect(result.receptions).toHaveLength(1);
      expect(result.receptions[0]).toMatchObject({
        id: reception.id,
        appointmentId: appointment.id,
        displayStatus: 'REGISTERED',
      });
      await expect(
        getDoctorScheduleParts({ ...actor, role: 'NURSE' }, '2030-01-01', '2030-01-01'),
      ).rejects.toMatchObject({ status: 403 });
    });
  });
  it('진료 시작일로 범위를 판단하여 이전 날짜에 접수된 진료도 반환하고 타 의사는 제외한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const doctor = {
        id: f.doctor.id,
        role: 'DOCTOR' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      const otherDoctor = await tx.account.create({
        data: {
          email: `cross-${f.doctor.id}@example.test`,
          name: '다른 의사',
          role: 'DOCTOR',
          passwordHash: 'test',
          doctor: { create: { departmentId: f.department.id } },
        },
      });
      const reception = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          receivedAt: new Date('2029-12-31T14:50:00Z'),
          status: 'CALLED',
        },
      });
      const visit = await tx.visit.create({
        data: {
          receptionId: reception.id,
          status: 'COMPLETED',
          startedAt: new Date('2029-12-31T15:05:00Z'),
          completedAt: new Date('2029-12-31T15:15:00Z'),
        },
      });
      const clinicalRecord = await tx.clinicalRecord.create({ data: { visitId: visit.id } });
      const otherReception = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: otherDoctor.id,
          departmentId: f.department.id,
          receivedAt: new Date('2029-12-31T14:50:00Z'),
          status: 'CALLED',
        },
      });
      await tx.visit.create({
        data: { receptionId: otherReception.id, startedAt: new Date('2029-12-31T15:05:00Z') },
      });
      const before = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          receivedAt: new Date('2029-12-31T13:50:00Z'),
          status: 'CALLED',
        },
      });
      await tx.visit.create({
        data: { receptionId: before.id, startedAt: new Date('2029-12-31T14:59:59Z') },
      });
      const nextReception = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          receivedAt: new Date('2029-12-31T14:40:00Z'),
          status: 'CALLED',
        },
      });
      await tx.visit.create({
        data: { receptionId: nextReception.id, startedAt: new Date('2030-01-01T15:00:00Z') },
      });
      const result = await getDoctorSchedule(doctor, '2030-01-01', '2030-01-01');
      expect(result.receptions).toHaveLength(0);
      expect(result.visits).toHaveLength(1);
      expect(result.visits[0]).toMatchObject({
        id: visit.id,
        receptionId: reception.id,
        patient: { id: f.patient.id, name: f.patient.name },
        doctor: { id: f.doctor.id },
        department: { id: f.department.id },
        status: 'COMPLETED',
        clinicalRecordId: clinicalRecord.id,
      });
    });
  });
});
