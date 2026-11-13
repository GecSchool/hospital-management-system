import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { app, createApp } from '../../../app.js';
import * as prismaConfig from '../../../config/prisma.js';
import { createAccountProvider } from '../../../common/middlewares/account-provider.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';

const prisma = prismaConfig.createPrismaClient(testDatabaseUrl());
afterAll(async () => { await prisma.$disconnect(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('진료과별 의료진·의사 조회', () => {
  it('기본 서버는 인증 없이 조회할 수 없다', async () => {
    expect((await request(app).get('/api/v1/departments/example/medical-staff')).status).toBe(401);
    expect((await request(app).get('/api/v1/departments/example/doctors')).status).toBe(401);
  });

  it('관리자 목록·페이지와 역할별 의사 조회 범위를 지킨다', async () => {
    const rollback = new Error('test rollback');
    try {
      await prisma.$transaction(async (tx) => {
        const id = randomUUID().replaceAll('-', '');
        const dep = await tx.department.create({ data: { id: `dep_${id}`, name: `test_${id}` } });
        const other = await tx.department.create({ data: { id: `other_${id}`, name: `other_${id}` } });
        const create = (suffix: string, role: 'ADMIN' | 'STAFF' | 'DOCTOR' | 'NURSE', status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') =>
          tx.account.create({ data: { id: `${suffix}_${id}`, email: `${suffix}-${id}@example.test`, name: `${suffix}-${id}`, passwordHash: 'sensitive', role, status,
            ...(role === 'DOCTOR' && { doctor: { create: { departmentId: dep.id } } }),
            ...(role === 'NURSE' && { nurse: { create: { departmentId: dep.id } } }),
          } });
        const admin = await create('admin', 'ADMIN');
        const staff = await create('staff', 'STAFF');
        const doctor = await create('doctor', 'DOCTOR');
        const inactiveDoctor = await create('inactive-doctor', 'DOCTOR', 'INACTIVE');
        const nurse = await create('nurse', 'NURSE');
        let currentId: string | null = admin.id;
        const accountProvider = createAccountProvider(async () => currentId, () => tx);
        vi.spyOn(prismaConfig, 'getPrismaClient').mockReturnValue(tx as ReturnType<typeof prismaConfig.getPrismaClient>);
        const fixture = createApp({ port: 3000, corsOrigin: undefined }, { accountProvider });

        const list = await request(fixture).get(`/api/v1/departments/${dep.id}/medical-staff`).query({ page: '1', size: '2' });
        expect(list.status).toBe(200);
        expect(list.body.data).toHaveLength(2);
        expect(list.body.meta).toEqual({ page: 1, size: 2, totalItems: 3, totalPages: 2 });
        expect(JSON.stringify(list.body)).not.toContain('sensitive');
        const nurses = await request(fixture).get(`/api/v1/departments/${dep.id}/medical-staff`).query({ role: 'NURSE' });
        expect(nurses.body.data).toHaveLength(1);
        expect(nurses.body.data[0]).toMatchObject({ id: nurse.id, role: 'NURSE', department: { id: dep.id }, doctorId: null });
        const nonMedical = await request(fixture).get(`/api/v1/departments/${dep.id}/medical-staff`).query({ role: 'STAFF' });
        expect(nonMedical.body.data).toEqual([]);
        const empty = await request(fixture).get(`/api/v1/departments/${other.id}/medical-staff`);
        expect(empty.body).toEqual({ data: [], meta: { page: 1, size: 20, totalItems: 0, totalPages: 0 } });
        expect((await request(fixture).get(`/api/v1/departments/${dep.id}/medical-staff`).query({ role: 'INVALID' })).status).toBe(400);

        const active = await request(fixture).get(`/api/v1/departments/${dep.id}/doctors`).query({ activeOnly: 'true' });
        expect(active.status).toBe(200);
        expect(active.body.data).toEqual([{ id: doctor.id, name: doctor.name, department: { id: dep.id, name: dep.name, status: 'ACTIVE' } }]);
        const all = await request(fixture).get(`/api/v1/departments/${dep.id}/doctors`).query({ activeOnly: 'false' });
        expect(all.body.data.map((row: { id: string }) => row.id)).toEqual(expect.arrayContaining([doctor.id, inactiveDoctor.id]));
        expect(all.body.data).toHaveLength(2);
        expect((await request(fixture).get(`/api/v1/departments/${dep.id}/doctors`)).body.data).toHaveLength(2);
        expect((await request(fixture).get(`/api/v1/departments/${dep.id}/doctors`).query({ activeOnly: '1' })).status).toBe(400);

        currentId = staff.id;
        expect((await request(fixture).get(`/api/v1/departments/${dep.id}/medical-staff`)).status).toBe(403);
        expect((await request(fixture).get(`/api/v1/departments/${dep.id}/doctors`)).status).toBe(200);
        currentId = nurse.id;
        expect((await request(fixture).get(`/api/v1/departments/${dep.id}/doctors`)).status).toBe(200);
        expect((await request(fixture).get(`/api/v1/departments/${other.id}/doctors`)).status).toBe(403);
        await tx.nurse.update({ where: { accountId: nurse.id }, data: { departmentId: other.id } });
        expect((await request(fixture).get(`/api/v1/departments/${dep.id}/doctors`)).status).toBe(403);
        expect((await request(fixture).get(`/api/v1/departments/${other.id}/doctors`)).body.data).toEqual([]);
        await tx.account.update({ where: { id: nurse.id }, data: { status: 'INACTIVE' } });
        const inactive = await request(fixture).get(`/api/v1/departments/${other.id}/doctors`);
        expect(inactive.status).toBe(403);
        expect(inactive.body.error.code).toBe('ACCOUNT_INACTIVE');
        currentId = doctor.id;
        expect((await request(fixture).get(`/api/v1/departments/${dep.id}/doctors`)).status).toBe(403);
        currentId = null;
        expect((await request(fixture).get(`/api/v1/departments/${dep.id}/doctors`)).status).toBe(401);
        throw rollback;
      }, { timeout: 15000 });
      throw new Error('test transaction did not roll back');
    } catch (error) {
      if (error !== rollback) throw error;
    }
  }, 20000);
});
