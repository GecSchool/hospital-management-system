import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createMockStaffService } from '../../services/mock/staff';
import { createMockAccountStore } from '../../services/mock/accounts';
import { createMockAuthService, mockAccounts } from '../../services/mock/auth';
import { apiClient } from '../../services/api/client';
import type { SelfAccount } from '../../types/auth';
import { apiDepartments } from './departmentService';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T03:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const doctor: SelfAccount = {
  ...mockAccounts.DOCTOR,
  role: 'DOCTOR',
  doctorId: 'demo-doctor-3',
};
const page = { page: 1, size: 100 };
function setup(extra: SelfAccount[] = [], count = 25) {
  const accounts = createMockAccountStore([
    ...Object.values(mockAccounts),
    ...extra,
  ]);
  const s = createMockStaffService({ accounts, latencyMs: 0, count });
  const principal = async () => accounts.get(mockAccounts.ADMIN.id);
  return {
    s,
    accounts,
    d: s.departments(principal),
    admin: s.admin(principal),
  };
}
it('lists all/active/inactive departments and updates live dashboard, invitation and booking choices', async () => {
  const { d, admin, s } = setup();
  expect(await d.list()).toHaveLength(2);
  expect(await d.list('INACTIVE')).toEqual([]);
  const created = await d.create('가상검사과');
  expect((await admin.dashboard()).departmentsByStatus.ACTIVE).toBe(3);
  expect((await admin.departments()).map((d) => d.id)).toContain(created.id);
  expect((await s.booking.departments()).map((d) => d.id)).toContain(
    created.id,
  );
  await d.changeStatus(created.id, 'INACTIVE');
  expect((await d.list('INACTIVE')).map((d) => d.id)).toEqual([created.id]);
  expect((await admin.dashboard()).departmentsByStatus).toEqual({
    ACTIVE: 2,
    INACTIVE: 1,
  });
  expect((await admin.departments()).map((d) => d.id)).not.toContain(
    created.id,
  );
  expect((await s.booking.departments()).map((d) => d.id)).not.toContain(
    created.id,
  );
  await d.changeStatus(created.id, 'ACTIVE');
  await d.remove(created.id);
  expect(await d.list()).toHaveLength(2);
  expect((await admin.dashboard()).departmentsByStatus).toEqual({
    ACTIVE: 2,
    INACTIVE: 0,
  });
});
it('validates names, rejects duplicates on create/edit and preserves existing data', async () => {
  const { d } = setup();
  const before = await d.list();
  for (const name of ['', '   '])
    await expect(d.create(name)).rejects.toMatchObject({ status: 400 });
  await expect(d.create(' 내과 ')).rejects.toMatchObject({
    code: 'DEPARTMENT_NAME_DUPLICATE',
    status: 409,
  });
  await expect(d.rename('demo-pediatric', '내과')).rejects.toMatchObject({
    code: 'DEPARTMENT_NAME_DUPLICATE',
  });
  expect(await d.list()).toEqual(before);
  await expect(d.rename('missing', '가상과')).rejects.toMatchObject({
    status: 404,
  });
});
it('renames without changing patient/appointment/reception/Visit IDs and projects the current name on historical reads', async () => {
  const { d, s, accounts, admin } = setup();
  const reception = (
    await s.intake.list({ date: '2026-11-09' }, page)
  ).data.find((r) => r.visitStatus === 'COMPLETED')!;
  const before = await s.intake.detail(reception.id);
  const clinical = s.clinical(async () => mockAccounts.DOCTOR);
  const visit = await clinical.visit(before.visitId!);
  const version = await clinical.version(visit.clinicalRecordId!, 1);
  await d.rename('demo-internal', '가상내과 변경');
  expect(await s.intake.detail(before.id)).toMatchObject({
    id: before.id,
    appointmentId: before.appointmentId,
    visitId: before.visitId,
    department: { id: 'demo-internal', name: '가상내과 변경' },
    doctor: { id: before.doctor.id },
  });
  expect((await s.booking.detail(before.appointmentId!)).department.name).toBe(
    '가상내과 변경',
  );
  expect((await clinical.visit(visit.id)).department).toMatchObject({
    id: 'demo-internal',
    name: '가상내과 변경',
  });
  expect(await clinical.version(visit.clinicalRecordId!, 1)).toEqual(version);
  expect((await admin.detail(mockAccounts.NURSE.id)).department?.name).toBe(
    '가상내과 변경',
  );
  expect(accounts.get(mockAccounts.DOCTOR.id).doctorId).toBe('demo-doctor');
});
it('refuses deactivation with active OR inactive staff and refuses deleting referenced departments', async () => {
  const { d, admin } = setup();
  await expect(
    d.changeStatus('demo-internal', 'INACTIVE'),
  ).rejects.toMatchObject({ code: 'DEPARTMENT_HAS_STAFF' });
  await admin.changeStatus(mockAccounts.NURSE.id, 'INACTIVE');
  await expect(
    d.changeStatus('demo-internal', 'INACTIVE'),
  ).rejects.toMatchObject({ code: 'DEPARTMENT_HAS_STAFF' });
  await expect(d.remove('demo-internal')).rejects.toMatchObject({
    code: 'DEPARTMENT_IN_USE',
  });
  expect((await d.list()).find((d) => d.id === 'demo-internal')?.status).toBe(
    'ACTIVE',
  );
});
it('uses the central account Map for medical role filters, status, pages and doctorId projection', async () => {
  const extra = Array.from({ length: 4 }, (_, i): SelfAccount => ({
    ...mockAccounts.NURSE,
    id: `extra-nurse-${i}`,
    name: `가상간호${i}`,
    email: `nurse${i}@example.test`,
  }));
  const { d, accounts } = setup(extra);
  const all = await d.medicalStaff('demo-internal', undefined, {
    page: 1,
    size: 3,
  });
  expect(all.meta).toMatchObject({ totalItems: 6, totalPages: 2 });
  expect(
    (await d.medicalStaff('demo-internal', 'DOCTOR', page)).data.map(
      (a) => a.id,
    ),
  ).toEqual([mockAccounts.DOCTOR.id]);
  expect(
    (await d.medicalStaff('demo-internal', 'NURSE', page)).data,
  ).toHaveLength(5);
  accounts.setStatus(mockAccounts.DOCTOR.id, 'INACTIVE');
  expect(await d.doctors('demo-internal', true)).toEqual([]);
  expect((await d.doctors('demo-internal', false))[0].id).toBe(
    mockAccounts.DOCTOR.doctorId,
  );
  expect((await d.medicalStaff('demo-internal', 'STAFF', page)).data).toEqual(
    [],
  );
});
it('moves nurses, updates account detail/auth scopes and denies stale old-department principals', async () => {
  const { d, s, accounts, admin } = setup();
  const auth = createMockAuthService({ accounts, latencyMs: 0 });
  await auth.login({ identifier: 'nurse', password: '1234' });
  const listener = vi.fn();
  const off = auth.onAccountChanged!(listener);
  const target = await d.create('가상신규과');
  await d.move(mockAccounts.NURSE.id, target.id);
  expect((await admin.detail(mockAccounts.NURSE.id)).department?.id).toBe(
    target.id,
  );
  expect((await auth.me())?.department?.id).toBe(target.id);
  expect(listener).toHaveBeenCalledOnce();
  expect((await d.medicalStaff('demo-internal', 'NURSE', page)).data).toEqual(
    [],
  );
  await expect(
    s
      .nurseBooking(async () => mockAccounts.NURSE)
      .booking.doctors('demo-internal'),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    s.departments(async () => mockAccounts.NURSE).doctors('demo-internal'),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    await s
      .nurse(async () => mockAccounts.NURSE)
      .list({ date: '2026-11-09' }, page),
  ).toMatchObject({ data: [] });
  off();
});
it('rejects nonmedical targets and inactive destinations while preserving original membership', async () => {
  const { d, accounts } = setup();
  const target = await d.create('가상비활성과');
  await d.changeStatus(target.id, 'INACTIVE');
  const before = accounts.get(mockAccounts.NURSE.id);
  await expect(d.move(before.id, target.id)).rejects.toMatchObject({
    status: 400,
  });
  await expect(
    d.move(mockAccounts.STAFF.id, 'demo-internal'),
  ).rejects.toMatchObject({ status: 400 });
  await expect(d.move(before.id, 'missing')).rejects.toMatchObject({
    status: 404,
  });
  expect(accounts.get(before.id)).toEqual(before);
});
it('blocks future/today bookings, permits past unreceived-only work and preserves historical doctor affiliation', async () => {
  const { d, s, accounts } = setup([doctor]);
  const target = await d.create('가상이동과');
  const a = await s.booking.create({
    patientId: 'demo-patient-3',
    departmentId: 'demo-internal',
    doctorId: doctor.doctorId!,
    startsAt: '2026-11-10T14:00:00+09:00',
  });
  await expect(d.move(doctor.id, target.id)).rejects.toMatchObject({
    code: 'DOCTOR_HAS_PENDING_WORK',
  });
  vi.setSystemTime(new Date('2026-11-10T01:00:00Z'));
  await expect(d.move(doctor.id, target.id)).rejects.toMatchObject({
    code: 'DOCTOR_HAS_PENDING_WORK',
  });
  vi.setSystemTime(new Date('2026-11-11T01:00:00Z'));
  await d.move(doctor.id, target.id);
  expect(accounts.get(doctor.id)).toMatchObject({
    id: doctor.id,
    doctorId: doctor.doctorId,
    department: { id: target.id },
  });
  expect(await s.booking.detail(a.id)).toEqual(a);
  expect(
    (await s.booking.doctors(target.id)).some((d) => d.id === doctor.doctorId),
  ).toBe(true);
  expect(
    (await s.booking.doctors('demo-internal')).some(
      (d) => d.id === doctor.doctorId,
    ),
  ).toBe(false);
  const booked = await s.booking.create({
    patientId: 'demo-patient-4',
    departmentId: target.id,
    doctorId: doctor.doctorId!,
    startsAt: '2026-11-12T14:00:00+09:00',
  });
  expect(booked.department.id).toBe(target.id);
});
it.each(['REGISTERED', 'IN_PROGRESS'] as const)(
  'blocks past unfinished %s work',
  async (state) => {
    const { d, s, accounts } = setup([doctor]);
    const target = await d.create('가상과');
    const r = await s.intake.create({
      patientId: 'demo-patient-3',
      departmentId: 'demo-internal',
      doctorId: doctor.doctorId!,
    });
    if (state === 'IN_PROGRESS') {
      const n = s.nurse(async () => mockAccounts.NURSE);
      await n.call(r.id);
      await n.enter(r.id);
    }
    vi.setSystemTime(new Date('2026-11-10T03:00:00Z'));
    await expect(d.move(doctor.id, target.id)).rejects.toMatchObject({
      code: 'DOCTOR_HAS_PENDING_WORK',
    });
    expect(accounts.get(doctor.id).department?.id).toBe('demo-internal');
  },
);
it('allows a doctor move after clinical completion while preserving old reception/Visit/record relations and old-department deletion protection', async () => {
  const { d, s, accounts } = setup([doctor]);
  const target = await d.create('가상완료후이동과');
  const r = await s.intake.create({
    patientId: 'demo-patient-3',
    departmentId: 'demo-internal',
    doctorId: doctor.doctorId!,
  });
  const n = s.nurse(async () => mockAccounts.NURSE);
  await n.call(r.id);
  const v = await n.enter(r.id);
  const c = s.clinical(async () => doctor);
  const complete = await c.complete(v.id, {
    symptoms: '[가상] 원본',
    diagnosis: '[가상]',
    opinion: '[가상]',
  });
  const oldReception = await s.intake.detail(r.id);
  const version = await c.version(complete.version.recordId, 1);
  await d.move(doctor.id, target.id);
  expect(await s.intake.detail(r.id)).toEqual(oldReception);
  expect((await c.visit(v.id)).department.id).toBe('demo-internal');
  expect(await c.version(complete.version.recordId, 1)).toEqual(version);
  expect(
    (
      await s
        .doctor(async () => accounts.get(doctor.id))
        .schedule('2026-11-09', '2026-11-09')
    ).visits.find((x) => x.id === v.id)?.receptionId,
  ).toBe(r.id);
  await d.move(mockAccounts.NURSE.id, target.id);
  await expect(d.remove('demo-internal')).rejects.toMatchObject({
    code: 'DEPARTMENT_IN_USE',
  });
});
it('retains cancelled appointment references after moving their doctor', async () => {
  const { d, s } = setup([doctor], 0);
  const original = await d.create('가상과거참조과');
  const target = await d.create('가상현재과');
  await d.move(doctor.id, original.id);
  const p = await s.create({
    name: '가상환자',
    residentNumber: '900101-0000000',
    phone: '010-0000-1111',
  });
  const a = await s.booking.create({
    patientId: p.id,
    doctorId: doctor.doctorId!,
    departmentId: original.id,
    startsAt: '2026-11-10T14:00:00+09:00',
  });
  await s.booking.cancel(a.id);
  await d.move(doctor.id, target.id);
  await expect(d.remove(original.id)).rejects.toMatchObject({
    code: 'DEPARTMENT_IN_USE',
  });
  expect((await s.booking.detail(a.id)).status).toBe('CANCELLED');
});
it('preserves all data on write errors and concurrent duplicate names', async () => {
  const { d, s, accounts } = setup();
  const empty = await d.create('가상검증과');
  const old = await d.list();
  const nurse = accounts.get(mockAccounts.NURSE.id);
  s.development!.setScenario('save-error');
  for (const f of [
    () => d.create('실패'),
    () => d.rename(empty.id, '실패'),
    () => d.changeStatus(empty.id, 'INACTIVE'),
    () => d.remove(empty.id),
    () => d.move(nurse.id, empty.id),
  ])
    await expect(f()).rejects.toMatchObject({ status: 500 });
  s.development!.setScenario('normal');
  expect(await d.list()).toEqual(old);
  expect(accounts.get(nurse.id)).toEqual(nurse);
  const results = await Promise.allSettled([
    d.create('가상중복과'),
    d.create('가상중복과'),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((r) => r.status === 'rejected')).toMatchObject({
    reason: { code: 'DEPARTMENT_NAME_DUPLICATE' },
  });
});
it.each([null, 'STAFF', 'NURSE', 'DOCTOR'] as const)(
  'enforces mutation and medical-staff permissions for %s',
  async (role) => {
    const { s } = setup();
    const d = s.departments(async () => (role ? mockAccounts[role] : null));
    for (const f of [
      () => d.create('가상과'),
      () => d.rename('demo-internal', '이름'),
      () => d.changeStatus('demo-internal', 'INACTIVE'),
      () => d.remove('demo-internal'),
      () => d.medicalStaff('demo-internal', undefined, page),
      () => d.move(mockAccounts.NURSE.id, 'demo-pediatric'),
    ])
      await expect(f()).rejects.toMatchObject({ status: role ? 403 : 401 });
    if (!role) await expect(d.list()).rejects.toMatchObject({ status: 401 });
    else
      expect((await d.list()).every((d) => d.status === 'ACTIVE')).toBe(true);
  },
);
it('permits DEP_07 for staff/admin and scopes nurses, while denying doctors', async () => {
  const { s } = setup();
  for (const role of ['ADMIN', 'STAFF'] as const)
    expect(
      await s
        .departments(async () => mockAccounts[role])
        .doctors('demo-internal'),
    ).toHaveLength(1);
  const nurse = s.departments(async () => mockAccounts.NURSE);
  expect(await nurse.doctors('demo-internal', true)).toHaveLength(1);
  await expect(nurse.doctors('demo-pediatric')).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    s.departments(async () => mockAccounts.DOCTOR).doctors('demo-internal'),
  ).rejects.toMatchObject({ status: 403 });
});
it('rechecks identity after pending operations and leaves data unchanged', async () => {
  const { s, d } = setup();
  let calls = 0;
  const switched = s.departments(async () =>
    ++calls === 1 ? mockAccounts.ADMIN : mockAccounts.STAFF,
  );
  await expect(switched.create('불허')).rejects.toMatchObject({ status: 403 });
  expect((await d.list()).some((d) => d.name === '불허')).toBe(false);
});
it('keeps booking creation and doctor movement consistent under competing requests', async () => {
  const { s, d, accounts } = setup([doctor]);
  const target = await d.create('가상경합과');
  const results = await Promise.allSettled([
    s.booking.create({
      patientId: 'demo-patient-3',
      departmentId: 'demo-internal',
      doctorId: doctor.doctorId!,
      startsAt: '2026-11-10T14:00:00+09:00',
    }),
    d.move(doctor.id, target.id),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const appointments = (
    await s.booking.list({ doctorId: doctor.doctorId }, page)
  ).data;
  if (accounts.get(doctor.id).department?.id === target.id)
    expect(appointments).toEqual([]);
  else expect(appointments).toHaveLength(1);
});
it('rejects accepting a pending medical invitation after the target department becomes inactive', async () => {
  const { s, d, accounts, admin } = setup();
  const target = await d.create('가상초대과');
  await admin.invite({
    name: '가상 초대 의사',
    email: 'invited@example.test',
    role: 'DOCTOR',
    departmentId: target.id,
  });
  const auth = createMockAuthService({ accounts, latencyMs: 0 });
  const token = accounts.latestToken('invitation')!;
  await d.changeStatus(target.id, 'INACTIVE');
  await expect(
    auth.acceptInvitation({
      token,
      password: 'synthetic-value',
      passwordConfirm: 'synthetic-value',
    }),
  ).rejects.toMatchObject({ status: 410 });
  expect(accounts.all()).toHaveLength(4);
  expect((await s.booking.departments()).some((d) => d.id === target.id)).toBe(
    false,
  );
});
it('uses exact DEP_01–08 paths, bodies, query/meta and bodyless 204 deletion without fallback', async () => {
  const envelope = {
    data: [],
    meta: { ...page, totalItems: 0, totalPages: 0 },
  };
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: envelope });
  const post = vi
    .spyOn(apiClient, 'post')
    .mockResolvedValue({ data: { data: { id: 'd' }, meta: null } });
  const patch = vi
    .spyOn(apiClient, 'patch')
    .mockResolvedValue({ data: { data: { id: 'd' }, meta: null } });
  const del = vi.spyOn(apiClient, 'delete').mockResolvedValue({ status: 204 });
  const signal = new AbortController().signal;
  await apiDepartments.list('INACTIVE', signal);
  await apiDepartments.create('가상과');
  await apiDepartments.rename('d/a', '새이름');
  await apiDepartments.changeStatus('d/a', 'INACTIVE');
  expect(
    await apiDepartments.medicalStaff('d/a', 'NURSE', page, signal),
  ).toEqual(envelope);
  await apiDepartments.doctors('d/a', false, signal);
  await apiDepartments.move('account/a', 'd/a');
  expect(await apiDepartments.remove('d/a')).toBeUndefined();
  expect(get).toHaveBeenCalledWith('/departments', {
    params: { status: 'INACTIVE' },
    signal,
  });
  expect(post).toHaveBeenCalledWith('/departments', { name: '가상과' });
  expect(patch).toHaveBeenCalledWith('/departments/d%2Fa', { name: '새이름' });
  expect(patch).toHaveBeenCalledWith('/departments/d%2Fa/status', {
    status: 'INACTIVE',
  });
  expect(get).toHaveBeenCalledWith('/departments/d%2Fa/medical-staff', {
    params: { role: 'NURSE', ...page },
    signal,
  });
  expect(get).toHaveBeenCalledWith('/departments/d%2Fa/doctors', {
    params: { activeOnly: false },
    signal,
  });
  expect(patch).toHaveBeenCalledWith('/medical-staff/account%2Fa/department', {
    departmentId: 'd/a',
  });
  expect(del).toHaveBeenCalledWith('/departments/d%2Fa');
  del.mockRejectedValueOnce(new Error('unavailable'));
  await expect(apiDepartments.remove('d/a')).rejects.toThrow('unavailable');
});
