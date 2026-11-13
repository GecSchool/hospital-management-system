import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { apiClient } from '../../services/api/client';
import { createMockStaffService } from '../../services/mock/staff';
import { mockAccounts } from '../../services/mock/auth';
import { apiNurseService } from './service';
const page = { page: 1, size: 100 };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T03:00:00Z'));
});
afterEach(() => vi.useRealTimers());
async function setup() {
  const s = createMockStaffService({ latencyMs: 0 });
  const nurse = s.nurse(async () => mockAccounts.NURSE);
  const a = await s.intake.create({
    patientId: 'demo-patient-3',
    departmentId: 'demo-internal',
    doctorId: 'demo-doctor-3',
  });
  const b = await s.intake.create({
    patientId: 'demo-patient-4',
    departmentId: 'demo-internal',
    doctorId: 'demo-doctor-3',
  });
  return { s, nurse, a, b };
}
it('enforces department and redacts staff identifiers in list/detail', async () => {
  const { s, nurse, a } = await setup();
  const foreign = await s.intake.create({
    patientId: 'demo-patient-3',
    departmentId: 'demo-pediatric',
    doctorId: 'demo-doctor-2',
  });
  const result = await nurse.list({ date: '2026-11-09' }, page);
  expect(
    result.data.every(
      (r) =>
        r.department.id === 'demo-internal' && !('patientNumber' in r.patient),
    ),
  ).toBe(true);
  expect('patientNumber' in (await nurse.detail(a.id)).patient).toBe(false);
  await expect(nurse.detail(foreign.id)).rejects.toMatchObject({ status: 403 });
  await expect(nurse.call(foreign.id)).rejects.toMatchObject({ status: 403 });
  await expect(nurse.enter(foreign.id)).rejects.toMatchObject({ status: 403 });
  await expect(
    nurse.list({ date: '2026-11-09', departmentId: 'demo-pediatric' }, page),
  ).rejects.toMatchObject({ status: 403 });
});
it.each(['STAFF', 'DOCTOR', 'ADMIN'] as const)(
  'rejects %s in the mock boundary',
  async (role) => {
    const { s, a } = await setup();
    const n = s.nurse(async () => mockAccounts[role]);
    await expect(n.list({ date: '2026-11-09' }, page)).rejects.toMatchObject({
      status: 403,
    });
    await expect(n.call(a.id)).rejects.toMatchObject({ status: 403 });
    await expect(n.enter(a.id)).rejects.toMatchObject({ status: 403 });
  },
);
it('releases same-doctor call and leaves other doctors unchanged', async () => {
  const { s, nurse, a, b } = await setup();
  const foreign = await s.intake.create({
    patientId: 'demo-patient-3',
    departmentId: 'demo-pediatric',
    doctorId: 'demo-doctor-2',
  });
  const other = s.nurse(async () => ({
    ...mockAccounts.NURSE,
    department: {
      id: 'demo-pediatric',
      name: '소아청소년과',
      status: 'ACTIVE',
    },
  }));
  await other.call(foreign.id);
  await nurse.call(a.id);
  expect((await nurse.call(b.id)).previousCalledReceptionId).toBe(a.id);
  expect((await s.intake.detail(a.id)).status).toBe('REGISTERED');
  expect((await s.intake.detail(foreign.id)).status).toBe('CALLED');
  await expect(nurse.enter(a.id)).rejects.toMatchObject({ status: 400 });
});
it('creates Visit preserving all relationships, projects employee status and blocks concurrent doctor work', async () => {
  const { s, nurse, a, b } = await setup();
  await nurse.call(a.id);
  const visit = await nurse.enter(a.id);
  expect(visit).toMatchObject({
    receptionId: a.id,
    patient: { id: a.patient.id },
    doctor: { id: a.doctor.id },
    status: 'IN_PROGRESS',
  });
  expect(await s.intake.detail(a.id)).toMatchObject({
    visitId: visit.id,
    visitStatus: 'IN_PROGRESS',
    displayStatus: 'IN_PROGRESS',
  });
  expect(
    (await s.dashboard()).receptionPreview.some(
      (r) => r.id === a.id && r.displayStatus === 'IN_PROGRESS',
    ),
  ).toBe(true);
  expect(
    (await s.receptions(a.patient.id, page)).data.find((r) => r.id === a.id)
      ?.visitId,
  ).toBe(visit.id);
  await expect(nurse.call(b.id)).rejects.toMatchObject({ code: 'DOCTOR_BUSY' });
  await expect(nurse.enter(a.id)).rejects.toMatchObject({
    code: 'DOCTOR_BUSY',
  });
  await expect(s.intake.remove(a.id)).rejects.toMatchObject({
    code: 'VISIT_ALREADY_STARTED',
  });
});
it('updates the linked appointment display status without changing IDs', async () => {
  const { s, nurse } = await setup();
  const a = await s.booking.create({
    patientId: 'demo-patient-5',
    departmentId: 'demo-internal',
    doctorId: 'demo-doctor-3',
    startsAt: '2026-11-09T14:00:00+09:00',
  });
  const r = await s.intake.create({ appointmentId: a.id });
  await nurse.call(r.id);
  expect((await s.booking.detail(a.id)).displayStatus).toBe('CALLED');
  const v = await nurse.enter(r.id);
  expect(await s.booking.detail(a.id)).toMatchObject({
    id: a.id,
    receptionId: r.id,
    displayStatus: 'IN_PROGRESS',
  });
  expect(v.receptionId).toBe(r.id);
});
it('serializes duplicate calls and call replacement/entry races without two visits', async () => {
  const { s, nurse, a, b } = await setup();
  const results = await Promise.allSettled([
    nurse.call(a.id),
    nurse.call(a.id),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  await nurse.call(b.id);
  await expect(nurse.enter(a.id)).rejects.toMatchObject({ status: 400 });
  const entries = await Promise.allSettled([
    nurse.enter(b.id),
    nurse.enter(b.id),
  ]);
  expect(entries.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect((await s.intake.detail(b.id)).visitStatus).toBe('IN_PROGRESS');
});
it('applies date/name/doctor/status filters, empty, paging, errors and session revocation', async () => {
  const { s, nurse, a } = await setup();
  expect(
    (
      await nurse.list(
        {
          date: '2026-11-09',
          name: a.patient.name,
          doctorId: a.doctor.id,
          status: 'REGISTERED',
        },
        { page: 1, size: 1 },
      )
    ).meta.totalItems,
  ).toBe(1);
  expect((await nurse.list({ date: '2020-01-01' }, page)).data).toEqual([]);
  s.development!.setScenario('save-error');
  await expect(nurse.call(a.id)).rejects.toMatchObject({ status: 500 });
  s.development!.setScenario('error');
  await expect(nurse.list({ date: '2026-11-09' }, page)).rejects.toMatchObject({
    status: 500,
  });
  await expect(s.nurse(async () => null).detail(a.id)).rejects.toMatchObject({
    status: 403,
  });
});
it('uses exact REC_02/03/05/07 methods, no POST body, cookies and encoded IDs', async () => {
  const original = apiClient.defaults.adapter;
  const requests: InternalAxiosRequestConfig[] = [];
  apiClient.defaults.adapter = async (config) => {
    requests.push(config);
    return {
      config,
      status: 200,
      statusText: 'OK',
      headers: new AxiosHeaders(),
      data: { data: [], meta: null },
    };
  };
  try {
    const n = apiNurseService(async () => mockAccounts.NURSE);
    const signal = new AbortController().signal;
    await n.list(
      { date: '2026-11-09', name: '가상' },
      { page: 2, size: 5 },
      signal,
    );
    await n.detail('a/b', signal);
    await n.call('a/b');
    await n.enter('a/b');
    await n.doctors(signal);
    expect(requests.map((r) => [r.method, r.url])).toEqual([
      ['get', '/receptions'],
      ['get', '/receptions/a%2Fb'],
      ['post', '/receptions/a%2Fb/call'],
      ['post', '/receptions/a%2Fb/confirm-entry'],
      ['get', '/departments/demo-internal/doctors'],
    ]);
    expect(requests[2].data).toBeUndefined();
    expect(requests[3].data).toBeUndefined();
    expect(requests.every((r) => r.withCredentials)).toBe(true);
    expect(requests[0].signal).toBe(signal);
  } finally {
    apiClient.defaults.adapter = original;
  }
});
