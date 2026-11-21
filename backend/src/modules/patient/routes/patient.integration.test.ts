import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../app.js';
import * as dbConfig from '../../../config/prisma.js';
import { createAccountProvider } from '../../../common/middlewares/account-provider.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import {
  createMedicalStaffFixture,
  createScheduledAppointmentFixture,
} from '../../../../tests/helpers/medical-staff-fixture.js';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createHash, randomInt } from 'node:crypto';
import { createPatient } from '../services/patient.service.js';
import { loadResidentNumberProtector, parseResidentNumber } from '../services/resident-number.js';

const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('환자 등록 및 검색', () => {
  it('동시에 등록해도 환자번호를 서로 다르게 발급하고 중복 저장을 막는다', async () => {
    const key = randomInt(1_000_000_000).toString();
    const ids: string[] = [];
    try {
      const rows = await Promise.all(
        [0, 1].map(async (index) => {
          const row = await prisma.patient.create({
            data: {
              name: `번호 테스트 ${key}`,
              birthDate: new Date('1990-01-01T00:00:00Z'),
              phone: '010-0000-0000',
              residentNumberCiphertext: Buffer.from(`cipher-${key}-${index}`),
              residentNumberLookup: createHash('sha256').update(`lookup-${key}-${index}`).digest(),
            },
          });
          ids.push(row.id);
          return row;
        }),
      );
      expect(rows[0].patientNumber).toMatch(/^P\d{8}$/);
      expect(rows[1].patientNumber).toMatch(/^P\d{8}$/);
      expect(rows[0].patientNumber).not.toBe(rows[1].patientNumber);
      await expect(
        prisma.patient.update({
          where: { id: rows[1].id },
          data: { patientNumber: rows[0].patientNumber },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    } finally {
      await prisma.patient.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it('직원이 등록하면 암호화 저장하고 마스킹된 상세만 돌려준다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const staff = await tx.account.create({
        data: {
          email: `staff-${f.admin.id}@example.test`,
          name: 'staff',
          role: 'STAFF',
          passwordHash: 'test',
        },
      });
      vi.stubEnv('RESIDENT_ENCRYPTION_KEY', '11'.repeat(32));
      vi.stubEnv('RESIDENT_LOOKUP_KEY', '22'.repeat(32));
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const app = createApp(
        { port: 3000, corsOrigin: undefined },
        {
          accountProvider: createAccountProvider(
            async () => staff.id,
            () => tx,
          ),
        },
      );
      const response = await request(app)
        .post('/api/v1/patients')
        .send({ name: '가상 환자', residentNumber: '900101-1234567', phone: '010-0000-0001' });
      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        name: '가상 환자',
        birthDate: '1990-01-01',
        maskedResidentNumber: '900101-1******',
      });
      expect(response.body.data.patientNumber).toMatch(/^P\d{8}$/);
      expect(JSON.stringify(response.body)).not.toContain('9001011234567');
      const saved = await tx.patient.findUniqueOrThrow({ where: { id: response.body.data.id } });
      expect(saved.patientNumber).toBe(response.body.data.patientNumber);
      expect(
        Buffer.from(saved.residentNumberCiphertext).includes(Buffer.from('9001011234567')),
      ).toBe(false);
      expect(saved.residentNumberLookup).toHaveLength(32);
      const detail = await request(app).get(`/api/v1/patients/${saved.id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data.maskedResidentNumber).toBe('900101-1******');
      const changed = await request(app)
        .patch(`/api/v1/patients/${saved.id}`)
        .send({ name: '변경 이름' });
      expect(changed.status).toBe(200);
      expect(changed.body.data.name).toBe('변경 이름');
      const unchangedNumber = await tx.patient.findUniqueOrThrow({ where: { id: saved.id } });
      expect(Buffer.from(unchangedNumber.residentNumberCiphertext)).toEqual(
        Buffer.from(saved.residentNumberCiphertext),
      );
      expect(Buffer.from(unchangedNumber.residentNumberLookup)).toEqual(
        Buffer.from(saved.residentNumberLookup),
      );
      const unchanged = await request(app).patch(`/api/v1/patients/${saved.id}`).send({});
      expect(unchanged.status).toBe(200);
      expect(unchanged.body.data.name).toBe('변경 이름');
      expect(
        (await request(app).patch(`/api/v1/patients/${saved.id}`).send({ phone: '-------' }))
          .status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .post('/api/v1/patients')
            .send({ name: '오류', residentNumber: '900101-1234567', phone: '-------' })
        ).status,
      ).toBe(400);
      for (const attempted of [
        { residentNumber: '9001021234567' },
        { residentNumber: '900101-1234567', name: '적용되면 안됨' },
        { residentNumber: '900101-1******', phone: '010-9999-9999' },
        { residentNumber: null },
      ]) {
        const denied = await request(app).patch(`/api/v1/patients/${saved.id}`).send(attempted);
        expect(denied.status).toBe(400);
        expect(denied.body.error.code).toBe('VALIDATION_ERROR');
        expect(denied.body.error.message).toBe('주민등록번호는 수정할 수 없습니다.');
      }
      const afterDenied = await tx.patient.findUniqueOrThrow({ where: { id: saved.id } });
      expect(afterDenied.name).toBe('변경 이름');
      expect(afterDenied.phone).toBe(saved.phone);
      expect(afterDenied.birthDate).toEqual(saved.birthDate);
      expect(Buffer.from(afterDenied.residentNumberCiphertext)).toEqual(
        Buffer.from(saved.residentNumberCiphertext),
      );
      expect(Buffer.from(afterDenied.residentNumberLookup)).toEqual(
        Buffer.from(saved.residentNumberLookup),
      );
      const filtered = await request(app)
        .get('/api/v1/patients')
        .query({ name: '변경', birthDate: '1990-01-01', patientNumber: saved.patientNumber });
      expect(filtered.body.data).toHaveLength(1);
      expect(filtered.body.data[0].patientNumber).toBe(saved.patientNumber);
      for (const phone of ['01000000001', '010-0000-0001', '00000001']) {
        const result = await request(app).get('/api/v1/patients').query({
          name: '변경',
          birthDate: '1990-01-01',
          phone,
        });
        expect(result.status).toBe(200);
        expect(result.body.data.map((row: { id: string }) => row.id)).toEqual([saved.id]);
      }
      await tx.patient.update({ where: { id: saved.id }, data: { phone: '01000000001' } });
      const hyphenatedSearch = await request(app)
        .get('/api/v1/patients')
        .query({ name: '변경', phone: '010-0000-0001' });
      expect(hyphenatedSearch.body.data.map((row: { id: string }) => row.id)).toEqual([saved.id]);
      expect(
        (await request(app).get('/api/v1/patients').query({ birthDate: '1990-02-30' })).status,
      ).toBe(400);
      expect((await request(app).get('/api/v1/patients/missing')).status).toBe(404);
      const duplicate = await request(app)
        .post('/api/v1/patients')
        .send({ name: '중복', residentNumber: '9001011234567', phone: '010-0000-0002' });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe('RESIDENT_NUMBER_DUPLICATE');
    });
  });

  it('같은 번호의 동시 등록은 하나만 성공한다', async () => {
    vi.stubEnv('RESIDENT_ENCRYPTION_KEY', '11'.repeat(32));
    vi.stubEnv('RESIDENT_LOOKUP_KEY', '22'.repeat(32));
    vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(prisma);
    const normalized = `9001011${String(randomInt(1000000)).padStart(6, '0')}`;
    const input = { ...parseResidentNumber(normalized), name: '동시 등록', phone: '010-0000-0000' };
    const lookup = loadResidentNumberProtector().lookup(normalized);
    const createdIds: string[] = [];
    try {
      const results = await Promise.allSettled([createPatient(input), createPatient(input)]);
      for (const result of results)
        if (result.status === 'fulfilled') createdIds.push(result.value.id);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((r) => r.status === 'rejected')).toMatchObject({
        status: 'rejected',
        reason: { code: 'RESIDENT_NUMBER_DUPLICATE' },
      });
      expect(await prisma.patient.count({ where: { residentNumberLookup: lookup } })).toBe(1);
    } finally {
      await prisma.patient.deleteMany({ where: { id: { in: createdIds } } });
    }
  });

  it('간호사는 환자번호를 검색하거나 응답에서 볼 수 없다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const app = createApp(
        { port: 3000, corsOrigin: undefined },
        {
          accountProvider: createAccountProvider(
            async () => f.nurse.id,
            () => tx,
          ),
        },
      );
      const result = await request(app).get('/api/v1/patients').query({ name: f.patient.name });
      expect(result.status).toBe(200);
      expect(result.body.data[0]).not.toHaveProperty('patientNumber');
      expect(
        (
          await request(app)
            .get('/api/v1/patients')
            .query({ patientNumber: f.patient.patientNumber })
        ).status,
      ).toBe(403);
      expect((await request(app).post('/api/v1/patients').send({})).status).toBe(403);
      expect((await request(app).get(`/api/v1/patients/${f.patient.id}`)).status).toBe(403);
      await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      const allowed = await request(app).get(`/api/v1/patients/${f.patient.id}`);
      expect(allowed.status).toBe(200);
      expect(allowed.body.data).toMatchObject({
        id: f.patient.id,
        name: f.patient.name,
        phone: f.patient.phone,
      });
      expect(allowed.body.data).not.toHaveProperty('patientNumber');
      expect(allowed.body.data).not.toHaveProperty('maskedResidentNumber');
      await tx.nurse.update({
        where: { accountId: f.nurse.id },
        data: { departmentId: f.otherDepartment.id },
      });
      expect((await request(app).get(`/api/v1/patients/${f.patient.id}`)).status).toBe(403);
    });
  });

  it('의사는 본인과 연결된 예약 또는 접수 환자만 조회한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const app = createApp(
        { port: 3000, corsOrigin: undefined },
        {
          accountProvider: createAccountProvider(
            async () => f.doctor.id,
            () => tx,
          ),
        },
      );
      expect((await request(app).get(`/api/v1/patients/${f.patient.id}`)).status).toBe(403);
      await createScheduledAppointmentFixture(tx, {
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2030-01-01T00:00:00Z'),
        },
      });
      const result = await request(app).get(`/api/v1/patients/${f.patient.id}`);
      expect(result.status).toBe(200);
      expect(result.body.data.id).toBe(f.patient.id);
      expect(result.body.data).not.toHaveProperty('maskedResidentNumber');
    });
  });

  it('의사에게 다른 의사의 예약만 있으면 환자 상세를 제공하지 않는다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const otherDoctor = await tx.account.create({
        data: {
          name: '다른 의사',
          email: `other-${f.admin.id}@example.test`,
          role: 'DOCTOR',
          passwordHash: 'test',
          doctor: { create: { departmentId: f.department.id } },
        },
      });
      await createScheduledAppointmentFixture(tx, {
        data: {
          patientId: f.patient.id,
          doctorAccountId: otherDoctor.id,
          departmentId: f.department.id,
          registeredByAccountId: f.admin.id,
          startsAt: new Date('2030-01-01T00:00:00Z'),
        },
      });
      vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(
        tx as ReturnType<typeof dbConfig.getPrismaClient>,
      );
      const app = createApp(
        { port: 3000, corsOrigin: undefined },
        {
          accountProvider: createAccountProvider(
            async () => f.doctor.id,
            () => tx,
          ),
        },
      );
      expect((await request(app).get(`/api/v1/patients/${f.patient.id}`)).status).toBe(403);
    });
  });
});
