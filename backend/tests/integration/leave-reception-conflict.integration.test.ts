import express from 'express';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDatabaseUrl } from '../../scripts/test-db-config.mjs';
import { errorHandler } from '../../src/common/errors/index.js';
import { createAccountProvider } from '../../src/common/middlewares/account-provider.js';
import { businessDate } from '../../src/common/utils/time.js';
import * as dbConfig from '../../src/config/prisma.js';
import { leaveRouter } from '../../src/modules/doctor-schedule/routes/leave.routes.js';
import { receptionRouter } from '../../src/modules/reception/routes/reception.routes.js';
import {
  createMedicalStaffFixture,
  createScheduledAppointmentFixture,
} from '../helpers/medical-staff-fixture.js';

const databaseUrl = testDatabaseUrl();
const prisma = dbConfig.createPrismaClient(databaseUrl);
const app = express();
app.locals.accountProvider = createAccountProvider(
  async (req) => req.get('X-Test-Account') ?? null,
  () => prisma,
);
app.use(express.json());
app.use('/api/v1', leaveRouter);
app.use('/api/v1/receptions', receptionRouter);
app.use(errorHandler);

async function createFixture() {
  return prisma.$transaction(async (tx) => {
    const f = await createMedicalStaffFixture(tx);
    const staff = await tx.account.create({
      data: {
        name: '접수 직원',
        email: `leave-reception-${f.admin.id}@example.test`,
        role: 'STAFF',
        passwordHash: 'test',
      },
    });
    return { ...f, staff };
  });
}

let fixture: Awaited<ReturnType<typeof createFixture>>;
let today: string;
beforeEach(async () => {
  fixture = await createFixture();
  today = businessDate(new Date());
  vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(prisma);
});
afterEach(async () => {
  vi.restoreAllMocks();
  const doctorAccountId = fixture.doctor.id;
  await prisma.visit.deleteMany({ where: { reception: { doctorAccountId } } });
  await prisma.reception.deleteMany({ where: { doctorAccountId } });
  await prisma.appointment.deleteMany({ where: { doctorAccountId } });
  await prisma.doctorLeave.deleteMany({ where: { doctorAccountId } });
  await prisma.doctorAvailability.deleteMany({ where: { doctorAccountId } });
  await prisma.patient.delete({ where: { id: fixture.patient.id } });
  await prisma.nurse.delete({ where: { accountId: fixture.nurse.id } });
  await prisma.doctor.delete({ where: { accountId: doctorAccountId } });
  await prisma.account.deleteMany({
    where: { id: { in: [doctorAccountId, fixture.staff.id, fixture.admin.id, fixture.nurse.id] } },
  });
  await prisma.department.deleteMany({
    where: {
      id: {
        in: [fixture.department.id, fixture.otherDepartment.id, fixture.inactiveDepartment.id],
      },
    },
  });
});
afterAll(() => prisma.$disconnect());

function postLeave() {
  return request(app)
    .post('/api/v1/doctors/me/leaves')
    .set('X-Test-Account', fixture.doctor.id)
    .send({ date: today });
}

function postWalkIn() {
  return request(app).post('/api/v1/receptions').set('X-Test-Account', fixture.staff.id).send({
    patientId: fixture.patient.id,
    departmentId: fixture.department.id,
    doctorId: fixture.doctor.id,
  });
}

describe('휴진과 현장 접수 충돌', () => {
  it('휴진을 먼저 등록하면 현장 접수를 409로 거절한다', async () => {
    await postLeave().expect(201);
    const { body } = await postWalkIn().expect(409);
    expect(body.error).toMatchObject({
      code: 'DOCTOR_ON_LEAVE',
      message: '휴진일에는 해당 의사에게 현장 접수할 수 없습니다.',
    });
    expect(await prisma.reception.count({ where: { doctorAccountId: fixture.doctor.id } })).toBe(0);
  });

  it.each([false, true])(
    '현장 접수가 있으면 휴진 신청을 409로 거절한다 (진료 완료=%s)',
    async (completed) => {
      const { body: reception } = await postWalkIn().expect(201);
      if (completed) {
        const now = new Date();
        await prisma.visit.create({
          data: {
            receptionId: reception.data.id,
            status: 'COMPLETED',
            startedAt: now,
            completedAt: now,
          },
        });
      }
      const { body } = await postLeave().expect(409);
      expect(body.error).toMatchObject({
        code: 'LEAVE_HAS_WALK_IN',
        message: '현장 접수가 있는 날짜는 휴진할 수 없습니다.',
      });
      expect(
        await prisma.doctorLeave.count({ where: { doctorAccountId: fixture.doctor.id } }),
      ).toBe(0);
    },
  );

  it('현장 접수와 휴진을 동시에 요청하면 하나만 201이고 다른 하나는 409다', async () => {
    const [leave, reception] = await Promise.all([postLeave(), postWalkIn()]);
    expect([leave.status, reception.status].sort()).toEqual([201, 409]);
    if (leave.status === 201) expect(reception.body.error.code).toBe('DOCTOR_ON_LEAVE');
    else expect(leave.body.error.code).toBe('LEAVE_HAS_WALK_IN');
    const where = { doctorAccountId: fixture.doctor.id };
    expect(await prisma.doctorLeave.count({ where })).toBe(leave.status === 201 ? 1 : 0);
    expect(await prisma.reception.count({ where })).toBe(reception.status === 201 ? 1 : 0);
  });

  it.each(['leave', 'reception'] as const)(
    'DB에서 %s가 미커밋인 동안 반대 저장은 잠금을 기다린 뒤 차단된다',
    async (firstWrite) => {
      const first = new Client({ connectionString: databaseUrl });
      const second = new Client({ connectionString: databaseUrl });
      const date = '2035-01-01';
      const writeLeave = (client: Client) =>
        client.query('INSERT INTO doctor_leaves (doctor_account_id, date) VALUES ($1, $2)', [
          fixture.doctor.id,
          date,
        ]);
      const writeReception = (client: Client) =>
        client.query(
          'INSERT INTO receptions (id, patient_id, doctor_account_id, department_id, received_at) VALUES ($1, $2, $3, $4, $5)',
          [
            `walk-in-${fixture.patient.id}`,
            fixture.patient.id,
            fixture.doctor.id,
            fixture.department.id,
            `${date}T00:00:00+09:00`,
          ],
        );
      try {
        await Promise.all([first.connect(), second.connect()]);
        const {
          rows: [{ pid }],
        } = await second.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
        await first.query('BEGIN');
        await (firstWrite === 'leave' ? writeLeave(first) : writeReception(first));
        const competingWrite = (
          firstWrite === 'leave' ? writeReception(second) : writeLeave(second)
        ).catch((error: unknown) => error);

        await vi.waitFor(async () => {
          const [{ waiting }] = await prisma.$queryRaw<{ waiting: boolean }[]>`
            SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid = ${pid} AND locktype = 'advisory' AND NOT granted) AS waiting
          `;
          expect(waiting).toBe(true);
        });
        await first.query('COMMIT');
        expect(await competingWrite).toMatchObject({
          code: '23514',
          constraint:
            firstWrite === 'leave'
              ? 'receptions_doctor_leave_check'
              : 'doctor_leaves_walk_in_reception_check',
        });
      } finally {
        await first.end();
        await second.end();
      }
    },
  );

  it('접수 시각과 휴진일을 바꿔도 서울 자정 경계에서 충돌을 검사한다', async () => {
    const doctorAccountId = fixture.doctor.id;
    const leaveDate = new Date('2035-01-01T00:00:00Z');
    const previousDay = new Date('2034-12-31T23:59:59.999+09:00');
    const startOfLeave = new Date('2035-01-01T00:00:00+09:00');
    await prisma.doctorLeave.create({ data: { doctorAccountId, date: leaveDate } });
    const reception = await prisma.reception.create({
      data: {
        doctorAccountId,
        departmentId: fixture.department.id,
        patientId: fixture.patient.id,
        receivedAt: previousDay,
      },
    });
    await expect(
      prisma.reception.update({
        where: { id: reception.id },
        data: { receivedAt: startOfLeave },
      }),
    ).rejects.toThrow('receptions_doctor_leave_check:');
    await expect(
      prisma.doctorLeave.update({
        where: { doctorAccountId_date: { doctorAccountId, date: leaveDate } },
        data: { date: new Date('2034-12-31T00:00:00Z') },
      }),
    ).rejects.toThrow('doctor_leaves_walk_in_reception_check:');
  });

  it('직접 휴진을 저장할 때도 같은 날의 유효 예약이 있으면 차단한다', async () => {
    const doctorAccountId = fixture.doctor.id;
    await createScheduledAppointmentFixture(prisma, {
      data: {
        patientId: fixture.patient.id,
        doctorAccountId,
        departmentId: fixture.department.id,
        registeredByAccountId: fixture.staff.id,
        startsAt: new Date('2035-01-01T09:00:00+09:00'),
      },
    });
    await expect(
      prisma.doctorLeave.create({
        data: { doctorAccountId, date: new Date('2035-01-01T00:00:00Z') },
      }),
    ).rejects.toThrow('doctor_leaves_booked_appointment_check:');
  });
});
