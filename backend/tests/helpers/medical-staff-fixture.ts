import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../src/generated/prisma/client.js';

export async function createMedicalStaffFixture(tx: Prisma.TransactionClient) {
  const id = randomUUID().replaceAll('-', '');
  const department = await tx.department.create({ data: { name: `department-${id}` } });
  const otherDepartment = await tx.department.create({ data: { name: `other-${id}` } });
  const inactiveDepartment = await tx.department.create({
    data: { name: `inactive-${id}`, status: 'INACTIVE' },
  });
  const admin = await tx.account.create({
    data: {
      email: `admin-${id}@example.test`,
      name: `admin-${id}`,
      role: 'ADMIN',
      passwordHash: 'test',
    },
  });
  const doctor = await tx.account.create({
    data: {
      email: `doctor-${id}@example.test`,
      name: `doctor-${id}`,
      role: 'DOCTOR',
      passwordHash: 'test',
      doctor: { create: { departmentId: department.id } },
    },
  });
  const nurse = await tx.account.create({
    data: {
      email: `nurse-${id}@example.test`,
      name: `nurse-${id}`,
      role: 'NURSE',
      passwordHash: 'test',
      nurse: { create: { departmentId: department.id } },
    },
  });
  const patient = await tx.patient.create({
    data: {
      patientNumber: `test-${id}`,
      name: 'test',
      residentNumberCiphertext: Buffer.from('synthetic'),
      residentNumberLookup: Buffer.from(id),
      birthDate: new Date('2000-01-01T00:00:00Z'),
      phone: '010-0000-0000',
    },
  });
  return { department, otherDepartment, inactiveDepartment, admin, doctor, nurse, patient };
}
