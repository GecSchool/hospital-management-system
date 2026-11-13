import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMockStaffService } from '../../services/mock/staff';
import { createMockAdminService } from '../../services/mock/admin';
import { createMockAccountStore } from '../../services/mock/accounts';
import { createMockAuthService, mockAccounts } from '../../services/mock/auth';
import { apiClient } from '../../services/api/client';
import type { SelfAccount } from '../../types/auth';
import { apiAdminService } from './service';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T03:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const page = { page: 1, size: 100 };
const ownDoctor: SelfAccount = {
  ...mockAccounts.DOCTOR,
  role: 'DOCTOR',
  doctorId: 'demo-doctor-3',
};
function setup(extra: SelfAccount[] = []) {
  const accounts = createMockAccountStore([
    ...Object.values(mockAccounts),
    ...extra,
  ]);
  const s = createMockStaffService({ accounts, latencyMs: 0 });
  return {
    accounts,
    s,
    admin: s.admin(async () => accounts.get(mockAccounts.ADMIN.id)),
  };
}
const invitation = {
  name: '가상 초대',
  email: 'invited@example.test',
  role: 'STAFF' as const,
};

it('derives role and department counts from the same live repositories and excludes pending invitations', async () => {
  const { accounts, admin } = setup();
  expect(await admin.dashboard()).toEqual({
    accountsByRole: { STAFF: 1, NURSE: 1, DOCTOR: 1, ADMIN: 1 },
    departmentsByStatus: { ACTIVE: 2, INACTIVE: 0 },
  });
  await admin.invite(invitation);
  expect((await admin.dashboard()).accountsByRole.STAFF).toBe(1);
  await admin.changeStatus(mockAccounts.STAFF.id, 'INACTIVE');
  expect((await admin.dashboard()).accountsByRole.STAFF).toBe(0);
  expect((await admin.list({}, page)).data).toEqual(accounts.all());
  await admin.changeStatus(mockAccounts.STAFF.id, 'ACTIVE');
  expect((await admin.dashboard()).accountsByRole.STAFF).toBe(1);
});
it('counts inactive departments from the supplied central department source', async () => {
  const accounts = createMockAccountStore();
  const admin = createMockAdminService(
    {
      accounts,
      wait: async () => {},
      doctorHasPendingWork: () => false,
      departments: () => [
        { id: 'on', name: '가상 활성', status: 'ACTIVE' },
        { id: 'off', name: '가상 비활성', status: 'INACTIVE' },
      ],
    },
    async () => mockAccounts.ADMIN,
  );
  expect((await admin.dashboard()).departmentsByStatus).toEqual({
    ACTIVE: 1,
    INACTIVE: 1,
  });
  expect((await admin.departments()).map((d) => d.id)).toEqual(['on']);
  await expect(
    admin.invite({ ...invitation, role: 'DOCTOR', departmentId: 'off' }),
  ).rejects.toMatchObject({ status: 400 });
});
it.each([
  [{}, 4],
  [{ name: '간호' }, 1],
  [{ email: 'DOCTOR@' }, 1],
  [{ role: 'NURSE' as const }, 1],
  [{ status: 'INACTIVE' as const }, 0],
  [
    {
      name: '간호',
      email: 'nurse@',
      role: 'NURSE' as const,
      status: 'ACTIVE' as const,
    },
    1,
  ],
  [{ name: '간호', email: 'doctor@' }, 0],
])(
  'applies account search with partial text, exact enums and AND: %o',
  async (filters, total) => {
    const { admin } = setup();
    expect((await admin.list(filters, page)).meta.totalItems).toBe(total);
  },
);
it('paginates without duplication and returns independent account detail with correct identifiers', async () => {
  const { admin } = setup();
  const first = await admin.list({}, { page: 1, size: 2 });
  const second = await admin.list({}, { page: 2, size: 2 });
  expect(first.meta.totalPages).toBe(2);
  expect(new Set([...first.data, ...second.data].map((a) => a.id)).size).toBe(
    4,
  );
  const row = await admin.detail(mockAccounts.DOCTOR.id);
  expect(row.id).not.toBe(row.doctorId);
  row.name = 'external change';
  expect((await admin.detail(row.id)).name).toBe(mockAccounts.DOCTOR.name);
  await expect(admin.detail('absent')).rejects.toMatchObject({
    code: 'NOT_FOUND',
    status: 404,
  });
  await expect(admin.list({}, { page: 0, size: 4 })).rejects.toMatchObject({
    status: 400,
  });
});
it.each(['DOCTOR', 'NURSE'] as const)(
  'requires an active department for %s invitation',
  async (role) => {
    const { admin, accounts } = setup();
    for (const departmentId of [undefined, null, 'absent'])
      await expect(
        admin.invite({ ...invitation, role, departmentId }),
      ).rejects.toMatchObject({ status: 400 });
    await admin.invite({ ...invitation, role, departmentId: 'demo-internal' });
    expect(accounts.all()).toHaveLength(4);
    const auth = createMockAuthService({ accounts, latencyMs: 0 });
    const token = auth.developmentToken!('invitation', 'managed')!;
    expect(await auth.verifyInvitation(token)).toMatchObject({
      role,
      department: { id: 'demo-internal' },
    });
    await auth.acceptInvitation({
      token,
      password: 'synthetic-value',
      passwordConfirm: 'synthetic-value',
    });
    expect(
      (await admin.list({ email: invitation.email }, page)).data,
    ).toHaveLength(1);
    expect((await admin.dashboard()).accountsByRole[role]).toBe(2);
    await expect(auth.verifyInvitation(token)).rejects.toMatchObject({
      status: 410,
    });
    expect(JSON.stringify(accounts.all())).not.toContain('synthetic-value');
  },
);
it.each(['STAFF', 'ADMIN'] as const)(
  'excludes department for %s and only creates an account upon acceptance',
  async (role) => {
    const { admin, accounts } = setup();
    await expect(
      admin.invite({ ...invitation, role, departmentId: 'demo-internal' }),
    ).rejects.toMatchObject({ status: 400 });
    const result = await admin.invite({ ...invitation, role });
    expect(result.message).toContain('실제 이메일은 발송되지 않았');
    expect(accounts.all()).toHaveLength(4);
  },
);
it('preserves state on invitation and status server failures', async () => {
  const { s, accounts, admin } = setup();
  const before = accounts.all();
  s.development!.setScenario('save-error');
  await expect(admin.invite(invitation)).rejects.toMatchObject({ status: 500 });
  await expect(
    admin.changeStatus(mockAccounts.STAFF.id, 'INACTIVE'),
  ).rejects.toMatchObject({ status: 500 });
  await expect(
    admin.requestPasswordReset(mockAccounts.STAFF.id),
  ).rejects.toMatchObject({ status: 500 });
  expect(accounts.all()).toEqual(before);
  expect(accounts.latestToken('invitation')).toBeUndefined();
  expect(accounts.latestToken('reset')).toBeUndefined();
});
it('protects the last active admin, including concurrent attempts to deactivate two admins', async () => {
  const { admin, accounts, s } = setup();
  await expect(
    admin.changeStatus(mockAccounts.ADMIN.id, 'INACTIVE'),
  ).rejects.toMatchObject({ code: 'LAST_ACTIVE_ADMIN', status: 409 });
  expect(accounts.get(mockAccounts.ADMIN.id).status).toBe('ACTIVE');
  const second = {
    ...mockAccounts.ADMIN,
    id: 'demo-admin-2',
    email: 'admin2@example.test',
  };
  const another = setup([second]);
  const other = another.s.admin(async () => another.accounts.get(second.id));
  const results = await Promise.allSettled([
    another.admin.changeStatus(mockAccounts.ADMIN.id, 'INACTIVE'),
    other.changeStatus(second.id, 'INACTIVE'),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    another.accounts
      .all()
      .filter((a) => a.role === 'ADMIN' && a.status === 'ACTIVE'),
  ).toHaveLength(1);
  expect(
    (
      await s
        .admin(async () => mockAccounts.ADMIN)
        .detail(mockAccounts.ADMIN.id)
    ).status,
  ).toBe('ACTIVE');
});
it('blocks today/future unreceived bookings but allows past-only bookings without modifying them', async () => {
  const { s, admin, accounts } = setup([ownDoctor]);
  const a = await s.booking.create({
    patientId: 'demo-patient-3',
    departmentId: 'demo-internal',
    doctorId: ownDoctor.doctorId!,
    startsAt: '2026-11-10T14:00:00+09:00',
  });
  await expect(
    admin.changeStatus(ownDoctor.id, 'INACTIVE'),
  ).rejects.toMatchObject({ code: 'DOCTOR_HAS_PENDING_WORK' });
  vi.setSystemTime(new Date('2026-11-10T01:00:00Z'));
  await expect(
    admin.changeStatus(ownDoctor.id, 'INACTIVE'),
  ).rejects.toMatchObject({ code: 'DOCTOR_HAS_PENDING_WORK' });
  expect(accounts.get(ownDoctor.id).status).toBe('ACTIVE');
  vi.setSystemTime(new Date('2026-11-11T01:00:00Z'));
  await admin.changeStatus(ownDoctor.id, 'INACTIVE');
  expect(await s.booking.detail(a.id)).toEqual(a);
});
it('permits cancelled-only bookings, preserves cancellation and never edits historical business records', async () => {
  const { s, admin } = setup([ownDoctor]);
  const a = await s.booking.create({
    patientId: 'demo-patient-3',
    departmentId: 'demo-internal',
    doctorId: ownDoctor.doctorId!,
    startsAt: '2026-11-10T14:00:00+09:00',
  });
  await s.booking.cancel(a.id);
  const old = await s.booking.detail(a.id);
  const patients = await s.list({}, page);
  await admin.changeStatus(ownDoctor.id, 'INACTIVE');
  expect(await s.booking.detail(a.id)).toEqual(old);
  expect(await s.list({}, page)).toEqual(patients);
});
it('blocks unfinished past reception/Visit and releases only after real clinical completion, preserving relationships', async () => {
  const { s, admin } = setup([ownDoctor]);
  const r = await s.intake.create({
    patientId: 'demo-patient-3',
    departmentId: 'demo-internal',
    doctorId: ownDoctor.doctorId!,
  });
  const nurse = s.nurse(async () => mockAccounts.NURSE);
  await nurse.call(r.id);
  const visit = await nurse.enter(r.id);
  vi.setSystemTime(new Date('2026-11-10T03:00:00Z'));
  await expect(
    admin.changeStatus(ownDoctor.id, 'INACTIVE'),
  ).rejects.toMatchObject({ code: 'DOCTOR_HAS_PENDING_WORK' });
  const clinical = s.clinical(async () => ownDoctor);
  const done = await clinical.complete(visit.id, {
    symptoms: '[가상]',
    diagnosis: '[가상]',
    opinion: '[가상]',
  });
  const oldReception = await s.intake.detail(r.id);
  await admin.changeStatus(ownDoctor.id, 'INACTIVE');
  expect(await s.intake.detail(r.id)).toEqual(oldReception);
  expect(await clinical.visit(visit.id)).toEqual(done.visit);
  expect(
    (await clinical.record(done.version.recordId)).latestVersion.author.id,
  ).toBe(ownDoctor.id);
});
it('invalidates live auth on deactivation and prevents old session revival after reactivation', async () => {
  const { accounts, admin } = setup();
  const auth = createMockAuthService({ accounts, latencyMs: 0 });
  const callback = vi.fn();
  const off = auth.onSessionInvalidated!(callback);
  await auth.login({ identifier: 'staff', password: '1234' });
  await admin.changeStatus(mockAccounts.STAFF.id, 'INACTIVE');
  expect(callback).toHaveBeenCalledOnce();
  expect(await auth.me()).toBeNull();
  await expect(
    auth.login({ identifier: 'staff', password: '1234' }),
  ).rejects.toMatchObject({ code: 'ACCOUNT_INACTIVE', status: 403 });
  await admin.changeStatus(mockAccounts.STAFF.id, 'ACTIVE');
  expect(await auth.me()).toBeNull();
  expect(
    (await auth.login({ identifier: 'staff', password: '1234' })).role,
  ).toBe('STAFF');
  off();
});
it('blocks an unfinished past reception before any Visit exists', async () => {
  const { s, admin } = setup([ownDoctor]);
  const reception = await s.intake.create({
    patientId: 'demo-patient-3',
    departmentId: 'demo-internal',
    doctorId: ownDoctor.doctorId!,
  });
  vi.setSystemTime(new Date('2026-11-10T03:00:00Z'));
  await expect(
    admin.changeStatus(ownDoctor.id, 'INACTIVE'),
  ).rejects.toMatchObject({ code: 'DOCTOR_HAS_PENDING_WORK' });
  expect(await s.intake.detail(reception.id)).toEqual(reception);
});
it('does not revive an unmounted auth session after deactivate/reactivate', async () => {
  const { accounts, admin } = setup();
  const auth = createMockAuthService({ accounts, latencyMs: 0 });
  await auth.login({ identifier: 'nurse', password: '1234' });
  await admin.changeStatus(mockAccounts.NURSE.id, 'INACTIVE');
  await admin.changeStatus(mockAccounts.NURSE.id, 'ACTIVE');
  expect(await auth.me()).toBeNull();
});
it.each(['ACTIVE', 'INACTIVE'] as const)(
  'reuses Phase 2 reset verification/confirmation without activating an %s account',
  async (status) => {
    const { admin, accounts } = setup();
    accounts.setStatus(mockAccounts.STAFF.id, status);
    const auth = createMockAuthService({ accounts, latencyMs: 0 });
    expect(
      (await admin.requestPasswordReset(mockAccounts.STAFF.id)).message,
    ).toContain('실제 이메일은 발송되지 않았');
    const token = auth.developmentToken!('reset', 'managed')!;
    await auth.verifyPasswordReset(token);
    await auth.confirmPasswordReset({
      token,
      password: 'synthetic-value',
      passwordConfirm: 'synthetic-value',
    });
    expect(accounts.get(mockAccounts.STAFF.id).status).toBe(status);
    await expect(auth.verifyPasswordReset(token)).rejects.toMatchObject({
      status: 410,
    });
  },
);
it.each([null, 'STAFF', 'NURSE', 'DOCTOR'] as const)(
  'denies every admin endpoint for %s at the mock service boundary',
  async (role) => {
    const { s } = setup();
    const a = s.admin(async () => (role ? mockAccounts[role] : null));
    for (const work of [
      () => a.dashboard(),
      () => a.list({}, page),
      () => a.detail(mockAccounts.STAFF.id),
      () => a.departments(),
      () => a.invite(invitation),
      () => a.changeStatus(mockAccounts.STAFF.id, 'INACTIVE'),
      () => a.requestPasswordReset(mockAccounts.STAFF.id),
    ])
      await expect(work()).rejects.toMatchObject({ status: role ? 403 : 401 });
  },
);
it('rechecks session identity/revocation after asynchronous requests before changing data', async () => {
  const extra = { ...mockAccounts.ADMIN, id: 'demo-admin-2' };
  const { s, accounts } = setup([extra]);
  let count = 0;
  await expect(
    s
      .admin(async () => (++count === 1 ? mockAccounts.ADMIN : extra))
      .invite(invitation),
  ).rejects.toMatchObject({ status: 403 });
  expect(accounts.latestToken('invitation')).toBeUndefined();
  const a = createMockAdminService(
    {
      accounts,
      departments: () => [],
      doctorHasPendingWork: () => false,
      wait: async () => {
        accounts.setStatus(mockAccounts.ADMIN.id, 'INACTIVE');
        accounts.setStatus(mockAccounts.ADMIN.id, 'ACTIVE');
      },
    },
    async () => mockAccounts.ADMIN,
  );
  await expect(
    a.changeStatus(mockAccounts.STAFF.id, 'INACTIVE'),
  ).rejects.toMatchObject({ status: 403 });
  expect(accounts.get(mockAccounts.STAFF.id).status).toBe('ACTIVE');
});
it('uses exact API paths, data/meta envelopes, filters, abort signals and optional department bodies', async () => {
  const data = { data: [], meta: { ...page, totalItems: 0, totalPages: 0 } };
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data });
  const post = vi
    .spyOn(apiClient, 'post')
    .mockResolvedValue({ data: { data: { message: 'accepted' }, meta: null } });
  const patch = vi
    .spyOn(apiClient, 'patch')
    .mockResolvedValue({ data: { data: mockAccounts.STAFF, meta: null } });
  const signal = new AbortController().signal;
  const filters = {
    name: '개발',
    email: 'example.test',
    role: 'STAFF' as const,
    status: 'ACTIVE' as const,
  };
  expect(await apiAdminService.list(filters, page, signal)).toEqual(data);
  await apiAdminService.dashboard(signal);
  await apiAdminService.detail('a/b', signal);
  await apiAdminService.departments(signal);
  await apiAdminService.invite({
    ...invitation,
    departmentId: 'must-not-send',
  });
  await apiAdminService.invite({
    ...invitation,
    role: 'DOCTOR',
    departmentId: 'demo-internal',
  });
  await apiAdminService.changeStatus('a/b', 'INACTIVE');
  await apiAdminService.requestPasswordReset('a/b');
  expect(get).toHaveBeenCalledWith('/accounts', {
    params: { ...filters, ...page },
    signal,
  });
  expect(get).toHaveBeenCalledWith('/dashboards/admin', { signal });
  expect(get).toHaveBeenCalledWith('/accounts/a%2Fb', { signal });
  expect(get).toHaveBeenCalledWith('/departments', {
    params: { status: 'ACTIVE' },
    signal,
  });
  expect(post).toHaveBeenCalledWith('/account-invitations', invitation);
  expect(post).toHaveBeenCalledWith('/account-invitations', {
    ...invitation,
    role: 'DOCTOR',
    departmentId: 'demo-internal',
  });
  expect(patch).toHaveBeenCalledWith('/accounts/a%2Fb/status', {
    status: 'INACTIVE',
  });
  expect(post).toHaveBeenCalledWith('/accounts/a%2Fb/password-reset');
});
