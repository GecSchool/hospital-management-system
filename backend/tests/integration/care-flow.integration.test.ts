import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import * as dbConfig from '../../src/config/prisma.js';
import { createAccountProvider } from '../../src/common/middlewares/account-provider.js';
import { businessDate } from '../../src/common/utils/time.js';
import { testDatabaseUrl } from '../../scripts/test-db-config.mjs';
import { createMedicalStaffFixture } from '../helpers/medical-staff-fixture.js';

const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('예약부터 진료·간호 기록까지 HTTP 통합 흐름', () => {
  it('직원·간호사·의사 역할로 업무를 이어가고 저장된 상태와 정정 이력을 확인한다', async () => {
    const fixture = await prisma.$transaction(async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const staff = await tx.account.create({
        data: {
          email: `staff-${f.admin.id}@example.test`,
          name: '테스트 직원',
          role: 'STAFF',
          passwordHash: 'test',
        },
      });
      const nurse2 = await tx.account.create({
        data: {
          email: `nurse2-${f.admin.id}@example.test`,
          name: '정정 간호사',
          role: 'NURSE',
          passwordHash: 'test',
          nurse: { create: { departmentId: f.department.id } },
        },
      });
      return { ...f, staff, nurse2 };
    });
    const f = fixture;
    try {
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(prisma);
      let currentId: string | null = null;
      const app = createApp(
        { port: 3000, corsOrigin: undefined },
        {
          accountProvider: createAccountProvider(
            async () => currentId,
            () => prisma,
          ),
        },
      );
      const today = businessDate(new Date());
      const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
      await prisma.doctorAvailability.create({
        data: {
          doctorAccountId: f.doctor.id,
          dayOfWeek: weekday,
          startMinute: 9 * 60,
          endMinute: 10 * 60,
        },
      });
      // 예약 당일 접수와 미래 예약 요건을 시간대에 관계없이 확인한다. 진료 완료 전에는 실제 시각으로 복원한다.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(`${today}T08:00:00+09:00`));
      const startsAt = `${today}T09:00:00+09:00`;
      currentId = f.staff.id;
      const appointment = await request(app).post('/api/v1/appointments').send({
        patientId: f.patient.id,
        departmentId: f.department.id,
        doctorId: f.doctor.id,
        startsAt,
      });
      expect(appointment.status, JSON.stringify(appointment.body)).toBe(201);
      expect(appointment.body.data).toMatchObject({
        displayStatus: 'BOOKED',
        registeredBy: { id: f.staff.id },
      });
      const appointmentId: string = appointment.body.data.id;
      const received = await request(app).post('/api/v1/receptions').send({ appointmentId });
      expect(received.status, JSON.stringify(received.body)).toBe(201);
      expect(received.body.data).toMatchObject({ appointmentId, displayStatus: 'REGISTERED' });
      const receptionId: string = received.body.data.id;
      vi.useRealTimers();

      // 호출·입실은 간호사만 가능하고 호출만으로 진료가 생성되지는 않는다.
      expect((await request(app).post(`/api/v1/receptions/${receptionId}/call`)).status).toBe(403);
      currentId = f.nurse.id;
      const called = await request(app).post(`/api/v1/receptions/${receptionId}/call`);
      expect(called.status, JSON.stringify(called.body)).toBe(200);
      expect(called.body.data).toMatchObject({
        reception: { id: receptionId, displayStatus: 'CALLED' },
        previousCalledReceptionId: null,
      });
      expect(await prisma.visit.findUnique({ where: { receptionId } })).toBeNull();
      const entered = await request(app).post(`/api/v1/receptions/${receptionId}/confirm-entry`);
      expect(entered.status, JSON.stringify(entered.body)).toBe(201);
      expect(entered.body.data).toMatchObject({
        receptionId,
        status: 'IN_PROGRESS',
        clinicalRecordId: null,
      });
      const visitId: string = entered.body.data.id;
      expect(
        (
          await request(app)
            .post(`/api/v1/visits/${visitId}/complete`)
            .send({ symptoms: '기침', diagnosis: '감기', opinion: '관찰' })
        ).status,
      ).toBe(403);
      currentId = f.doctor.id;
      const completed = await request(app)
        .post(`/api/v1/visits/${visitId}/complete`)
        .send({ symptoms: '기침', diagnosis: '감기', opinion: '관찰' });
      expect(completed.status, JSON.stringify(completed.body)).toBe(200);
      expect(completed.body.data).toMatchObject({
        visit: { id: visitId, status: 'COMPLETED' },
        version: { versionNo: 1, author: { id: f.doctor.id } },
      });
      expect((await prisma.visit.findUniqueOrThrow({ where: { id: visitId } })).status).toBe(
        'COMPLETED',
      );

      // 완료 이후 간호기록을 쓰고 같은 과의 다른 간호사가 정정한다.
      currentId = f.nurse.id;
      const nursing = await request(app)
        .post(`/api/v1/receptions/${receptionId}/nursing-records`)
        .send({ content: '혈압 측정' });
      expect(nursing.status, JSON.stringify(nursing.body)).toBe(201);
      expect(nursing.body.data).toMatchObject({
        receptionId,
        author: { id: f.nurse.id },
        latestVersion: { versionNo: 1, content: '혈압 측정' },
      });
      const recordId: string = nursing.body.data.id;
      currentId = f.nurse2.id;
      const correction = await request(app)
        .post(`/api/v1/nursing-records/${recordId}/versions`)
        .send({ baseVersionNo: 1, content: '혈압 재측정', correctionReason: '수치 확인' });
      expect(correction.status, JSON.stringify(correction.body)).toBe(201);
      expect(correction.body.data).toMatchObject({
        recordId,
        versionNo: 2,
        author: { id: f.nurse2.id },
        correctionReason: '수치 확인',
      });
      const versions = await prisma.nursingRecordVersion.findMany({
        where: { recordId },
        orderBy: { versionNo: 'asc' },
      });
      expect(
        versions.map((v) => ({
          versionNo: v.versionNo,
          content: v.content,
          authorAccountId: v.authorAccountId,
        })),
      ).toEqual([
        { versionNo: 1, content: '혈압 측정', authorAccountId: f.nurse.id },
        { versionNo: 2, content: '혈압 재측정', authorAccountId: f.nurse2.id },
      ]);
      currentId = f.doctor.id;
      const detail = await request(app).get(`/api/v1/nursing-records/${recordId}`);
      expect(detail.status, JSON.stringify(detail.body)).toBe(200);
      expect(detail.body.data).toMatchObject({
        id: recordId,
        latestVersion: { versionNo: 2, author: { id: f.nurse2.id } },
      });
      expect(detail.body.data.versions.map((v: { versionNo: number }) => v.versionNo)).toEqual([
        1, 2,
      ]);
      currentId = f.staff.id;
      expect((await request(app).get(`/api/v1/nursing-records/${recordId}`)).status).toBe(403);
    } finally {
      vi.useRealTimers();
      // 공유 테스트 DB에서 이 테스트가 만든 데이터만 삭제한다.
      const receptions = await prisma.reception.findMany({
        where: { patientId: f.patient.id },
        select: { id: true },
      });
      const receptionIds = receptions.map((r) => r.id);
      const visits = await prisma.visit.findMany({
        where: { receptionId: { in: receptionIds } },
        select: { id: true },
      });
      const records = await prisma.clinicalRecord.findMany({
        where: { visitId: { in: visits.map((v) => v.id) } },
        select: { id: true },
      });
      const nursing = await prisma.nursingRecord.findMany({
        where: { receptionId: { in: receptionIds } },
        select: { id: true },
      });
      await prisma.nursingRecordVersion.deleteMany({
        where: { recordId: { in: nursing.map((r) => r.id) } },
      });
      await prisma.nursingRecord.deleteMany({ where: { id: { in: nursing.map((r) => r.id) } } });
      await prisma.clinicalRecordVersion.deleteMany({
        where: { recordId: { in: records.map((r) => r.id) } },
      });
      await prisma.clinicalRecord.deleteMany({ where: { id: { in: records.map((r) => r.id) } } });
      await prisma.visit.deleteMany({ where: { id: { in: visits.map((v) => v.id) } } });
      await prisma.reception.deleteMany({ where: { id: { in: receptionIds } } });
      await prisma.appointment.deleteMany({ where: { patientId: f.patient.id } });
      await prisma.doctorAvailability.deleteMany({ where: { doctorAccountId: f.doctor.id } });
      await prisma.doctor.deleteMany({ where: { accountId: f.doctor.id } });
      await prisma.nurse.deleteMany({ where: { accountId: { in: [f.nurse.id, f.nurse2.id] } } });
      await prisma.patient.deleteMany({ where: { id: f.patient.id } });
      await prisma.account.deleteMany({
        where: { id: { in: [f.admin.id, f.staff.id, f.doctor.id, f.nurse.id, f.nurse2.id] } },
      });
      await prisma.department.deleteMany({
        where: { id: { in: [f.department.id, f.otherDepartment.id, f.inactiveDepartment.id] } },
      });
    }
  });
});
