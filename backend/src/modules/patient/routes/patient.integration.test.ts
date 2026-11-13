import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../app.js';
import * as dbConfig from '../../../config/prisma.js';
import { createAccountProvider } from '../../../common/middlewares/account-provider.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { randomInt } from 'node:crypto';
import { createPatient, updatePatient } from '../services/patient.service.js';
import { loadResidentNumberProtector, parseResidentNumber } from '../services/resident-number.js';

const prisma = dbConfig.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('환자 등록 및 검색', () => {
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
      expect(response.body.data.patientNumber).toBeTruthy();
      expect(JSON.stringify(response.body)).not.toContain('9001011234567');
      const saved = await tx.patient.findUniqueOrThrow({ where: { id: response.body.data.id } });
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
      const numberChange = await request(app)
        .patch(`/api/v1/patients/${saved.id}`)
        .send({ residentNumber: '9001021234567' });
      expect(numberChange.status).toBe(200);
      expect(numberChange.body.data).toMatchObject({
        birthDate: '1990-01-02',
        maskedResidentNumber: '900102-1******',
      });
      expect(JSON.stringify(numberChange.body)).not.toContain('9001021234567');
      const updated = await tx.patient.findUniqueOrThrow({ where: { id: saved.id } });
      expect(updated.birthDate.toISOString().slice(0, 10)).toBe('1990-01-02');
      expect(loadResidentNumberProtector().decrypt(updated.residentNumberCiphertext)).toBe(
        '9001021234567',
      );
      expect(Buffer.from(updated.residentNumberLookup)).toEqual(
        loadResidentNumberProtector().lookup('9001021234567'),
      );
      const same = await request(app)
        .patch(`/api/v1/patients/${saved.id}`)
        .send({ residentNumber: '900102-1234567' });
      expect(same.status).toBe(200);
      const other = await createPatient({
        ...parseResidentNumber('9101011234567'),
        name: '다른 환자',
        phone: '010-0000-0000',
      });
      const conflict = await request(app)
        .patch(`/api/v1/patients/${saved.id}`)
        .send({ name: '적용되면 안됨', residentNumber: '9101011234567' });
      expect(conflict.status).toBe(409);
      expect(conflict.body.error.code).toBe('RESIDENT_NUMBER_DUPLICATE');
      expect((await tx.patient.findUniqueOrThrow({ where: { id: saved.id } })).name).toBe(
        '변경 이름',
      );
      expect(other.id).not.toBe(saved.id);
      const maskedChange = await request(app)
        .patch(`/api/v1/patients/${saved.id}`)
        .send({ residentNumber: '900101-1******' });
      expect(maskedChange.status).toBe(400);
      const filtered = await request(app)
        .get('/api/v1/patients')
        .query({ name: '변경', birthDate: '1990-01-02', patientNumber: saved.patientNumber });
      expect(filtered.body.data).toHaveLength(1);
      expect(filtered.body.data[0].patientNumber).toBe(saved.patientNumber);
      expect(
        (await request(app).get('/api/v1/patients').query({ birthDate: '1990-02-30' })).status,
      ).toBe(400);
      expect((await request(app).get('/api/v1/patients/missing')).status).toBe(404);
      const duplicate = await request(app)
        .post('/api/v1/patients')
        .send({ name: '중복', residentNumber: '9001021234567', phone: '010-0000-0002' });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe('RESIDENT_NUMBER_DUPLICATE');
    });
  });

  it('두 환자가 동일한 번호로 동시에 수정하면 하나만 성공한다', async () => {
    vi.stubEnv('RESIDENT_ENCRYPTION_KEY', '11'.repeat(32));
    vi.stubEnv('RESIDENT_LOOKUP_KEY', '22'.repeat(32));
    vi.spyOn(dbConfig, 'getPrismaClient').mockReturnValue(prisma);
    const suffix = String(randomInt(1000000)).padStart(6, '0');
    const nums = [`9201011${suffix}`, `9201021${suffix}`, `9201031${suffix}`];
    const ids: string[] = [];
    try {
      for (const number of nums.slice(0, 2)) {
        const p = await createPatient({
          ...parseResidentNumber(number),
          name: '동시 수정',
          phone: '010-0000-0000',
        });
        ids.push(p.id);
      }
      const results = await Promise.allSettled(
        ids.map((id) =>
          updatePatient(id, {
            residentNumber: parseResidentNumber(nums[2]),
            name: undefined,
            phone: undefined,
          }),
        ),
      );
      expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((x) => x.status === 'rejected')).toMatchObject({
        status: 'rejected',
        reason: { code: 'RESIDENT_NUMBER_DUPLICATE' },
      });
      expect(
        await prisma.patient.count({
          where: { residentNumberLookup: loadResidentNumberProtector().lookup(nums[2]) },
        }),
      ).toBe(1);
    } finally {
      await prisma.patient.deleteMany({ where: { id: { in: ids } } });
    }
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
      await tx.appointment.create({
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
      await tx.appointment.create({
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
