import { randomUUID } from 'node:crypto';
import { businessDate, dayOfWeek } from '../../src/common/utils/time.js';
import type { Prisma } from '../../src/generated/prisma/client.js';

// Tests that start with a reservation also need the weekly slot that made it bookable.
export async function createScheduledAppointmentFixture(
  tx: Prisma.TransactionClient,
  { data }: { data: Prisma.AppointmentUncheckedCreateInput & { startsAt: Date } },
) {
  const { doctorAccountId, startsAt } = data;
  const midnight = new Date(`${businessDate(startsAt)}T00:00:00+09:00`);
  const startMinute = (startsAt.getTime() - midnight.getTime()) / 60_000;
  const day = { doctorAccountId, dayOfWeek: dayOfWeek(startsAt) };
  const availability = await tx.doctorAvailability.findFirst({
    where: { ...day, startMinute: { lte: startMinute }, endMinute: { gte: startMinute + 20 } },
  });
  if (!availability) {
    await tx.doctorAvailability.create({
      data: { ...day, startMinute, endMinute: startMinute + 20 },
    });
  }
  return tx.appointment.create({ data });
}

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
