import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../../config/prisma.js';
import { testDatabaseUrl } from '../../../../scripts/test-db-config.mjs';
import { withRollback } from '../../../../tests/helpers/transaction.js';
import { createMedicalStaffFixture } from '../../../../tests/helpers/medical-staff-fixture.js';
import { callReception, confirmEntry } from './calling.service.js';
const prisma = db.createPrismaClient(testDatabaseUrl());
afterAll(() => prisma.$disconnect());
afterEach(() => vi.restoreAllMocks());

describe('간호사 호출·입실', () => {
  it('같은 의사 기존 호출을 되돌리고 새 환자를 호출한 후 입실 확인한다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const data = {
        patientId: f.patient.id,
        doctorAccountId: f.doctor.id,
        departmentId: f.department.id,
      };
      const first = await tx.reception.create({ data });
      const second = await tx.reception.create({ data });
      const proxy = new Proxy(tx, {
        get(t, k, r) {
          return k === '$transaction'
            ? async (fn: (tx: typeof t) => Promise<unknown>) => fn(t)
            : Reflect.get(t, k, r);
        },
      });
      vi.spyOn(db, 'getPrismaClient').mockReturnValue(
        proxy as ReturnType<typeof db.getPrismaClient>,
      );
      const nurse = {
        id: f.nurse.id,
        role: 'NURSE' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      expect((await callReception(first.id, nurse)).previousCalledReceptionId).toBeNull();
      const result = await callReception(second.id, nurse);
      expect(result.previousCalledReceptionId).toBe(first.id);
      expect((await tx.reception.findUniqueOrThrow({ where: { id: first.id } })).status).toBe(
        'REGISTERED',
      );
      expect(result.reception.status).toBe('CALLED');
      await expect(confirmEntry(first.id, nurse)).rejects.toMatchObject({ status: 409 });
      const visit = await confirmEntry(second.id, nurse);
      expect(visit).toMatchObject({ receptionId: second.id, status: 'IN_PROGRESS' });
      await expect(callReception(first.id, nurse)).rejects.toMatchObject({
        status: 409,
        code: 'DOCTOR_BUSY',
      });
      expect((await tx.reception.findUniqueOrThrow({ where: { id: first.id } })).status).toBe(
        'REGISTERED',
      );
    });
  });
  it('호출 교체와 입실이 경합해도 현재 호출 환자만 입실하거나 진행 중 진료를 유지한다', async () => {
    const f = await createMedicalStaffFixture(prisma);
    const data = {
      patientId: f.patient.id,
      doctorAccountId: f.doctor.id,
      departmentId: f.department.id,
    };
    const ids: string[] = [];
    vi.spyOn(db, 'getPrismaClient').mockReturnValue(prisma);
    const nurse = {
      id: f.nurse.id,
      role: 'NURSE' as const,
      status: 'ACTIVE' as const,
      departmentId: f.department.id,
    };
    try {
      const first = await prisma.reception.create({ data });
      ids.push(first.id);
      const second = await prisma.reception.create({ data });
      ids.push(second.id);
      await callReception(first.id, nurse);
      const result = await Promise.allSettled([
        confirmEntry(first.id, nurse),
        callReception(second.id, nurse),
      ]);
      expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const visits = await prisma.visit.findMany({ where: { receptionId: { in: ids } } });
      const rows = await prisma.reception.findMany({
        where: { id: { in: ids } },
        include: { visit: true },
      });
      expect(visits.length).toBeLessThanOrEqual(1);
      expect(rows.filter((r) => r.status === 'CALLED' && !r.visit)).toHaveLength(
        visits.length === 0 ? 1 : 0,
      );
      if (visits.length === 1) expect(visits[0].receptionId).toBe(first.id);
    } finally {
      await prisma.visit.deleteMany({ where: { receptionId: { in: ids } } });
      await prisma.reception.deleteMany({ where: { id: { in: ids } } });
      await prisma.patient.delete({ where: { id: f.patient.id } });
      await prisma.doctor.delete({ where: { accountId: f.doctor.id } });
      await prisma.nurse.delete({ where: { accountId: f.nurse.id } });
      await prisma.account.deleteMany({
        where: { id: { in: [f.admin.id, f.doctor.id, f.nurse.id] } },
      });
      await prisma.department.deleteMany({
        where: { id: { in: [f.department.id, f.otherDepartment.id, f.inactiveDepartment.id] } },
      });
    }
  });
  it('다른 과 간호사는 호출하거나 입실시킬 수 없다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const reception = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.otherDepartment.id,
        },
      });
      const proxy = new Proxy(tx, {
        get(t, k, r) {
          return k === '$transaction'
            ? async (fn: (tx: typeof t) => Promise<unknown>) => fn(t)
            : Reflect.get(t, k, r);
        },
      });
      vi.spyOn(db, 'getPrismaClient').mockReturnValue(
        proxy as ReturnType<typeof db.getPrismaClient>,
      );
      const nurse = {
        id: f.nurse.id,
        role: 'NURSE' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      await expect(callReception(reception.id, nurse)).rejects.toMatchObject({ status: 403 });
      await expect(confirmEntry(reception.id, nurse)).rejects.toMatchObject({ status: 403 });
    });
  });
  it('다른 의사의 호출은 그대로 두고, 현재 호출되지 않은 환자는 입실시킬 수 없다', async () => {
    await withRollback(prisma, async (tx) => {
      const f = await createMedicalStaffFixture(tx);
      const otherDoctor = await tx.account.create({
        data: {
          name: '다른 의사',
          email: `doctor-${f.admin.id}@example.test`,
          role: 'DOCTOR',
          passwordHash: 'test',
          doctor: { create: { departmentId: f.department.id } },
        },
      });
      const other = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: otherDoctor.id,
          departmentId: f.department.id,
          status: 'CALLED',
        },
      });
      const own = await tx.reception.create({
        data: {
          patientId: f.patient.id,
          doctorAccountId: f.doctor.id,
          departmentId: f.department.id,
        },
      });
      const proxy = new Proxy(tx, {
        get(t, k, r) {
          return k === '$transaction'
            ? async (fn: (tx: typeof t) => Promise<unknown>) => fn(t)
            : Reflect.get(t, k, r);
        },
      });
      vi.spyOn(db, 'getPrismaClient').mockReturnValue(
        proxy as ReturnType<typeof db.getPrismaClient>,
      );
      const nurse = {
        id: f.nurse.id,
        role: 'NURSE' as const,
        status: 'ACTIVE' as const,
        departmentId: f.department.id,
      };
      await expect(confirmEntry(own.id, nurse)).rejects.toMatchObject({ status: 409 });
      expect((await callReception(own.id, nurse)).previousCalledReceptionId).toBeNull();
      expect((await tx.reception.findUniqueOrThrow({ where: { id: other.id } })).status).toBe(
        'CALLED',
      );
      await tx.account.update({ where: { id: f.nurse.id }, data: { status: 'INACTIVE' } });
      await expect(confirmEntry(own.id, nurse)).rejects.toMatchObject({
        status: 403,
        code: 'ACCOUNT_INACTIVE',
      });
    });
  });
});
