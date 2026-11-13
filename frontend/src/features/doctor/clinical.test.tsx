import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { createMockStaffService } from '../../services/mock/staff';
import { mockAccounts, createMockAuthService } from '../../services/mock/auth';
import { AppRoutes } from '../../app/router/routes';
import { AppProviders } from '../../app/providers/AppProviders';
import { createQueryClient } from '../../app/providers/queryClient';
import { apiClient } from '../../services/api/client';
import { apiClinicalService } from './clinicalService';
import { queryKeys } from '../../services/api/queryKeys';
vi.mock('../../services/mode', () => ({ apiMode: 'mock' }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T03:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const doctor = {
  ...mockAccounts.DOCTOR,
  role: 'DOCTOR' as const,
  doctorId: 'demo-doctor-3',
};
const input = {
  symptoms: '[가상] 증상 확인',
  diagnosis: '[가상] 진단 예시',
  opinion: '[가상] 상태 관찰',
};
async function setup() {
  const s = createMockStaffService({ latencyMs: 0 });
  const p = await s.create({
    name: '가상진료환자',
    residentNumber: '900101-0000000',
    phone: '010-0000-1111',
  });
  const a = await s.booking.create({
    patientId: p.id,
    departmentId: 'demo-internal',
    doctorId: doctor.doctorId,
    startsAt: '2026-11-09T14:00:00+09:00',
  });
  const r = await s.intake.create({ appointmentId: a.id });
  const nurse = s.nurse(async () => mockAccounts.NURSE);
  await nurse.call(r.id);
  const v = await nurse.enter(r.id);
  const c = s.clinical(async () => doctor);
  return { s, p, a, r, v, c, nurse };
}
it('lists own patients, merges linked appointments/receptions and filters status without pagination', async () => {
  const { s, c, v, r, a, p } = await setup();
  const rows = await c.patients('2026-11-09');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    patient: { id: p.id },
    appointmentId: a.id,
    receptionId: r.id,
    visitId: v.id,
    displayStatus: 'IN_PROGRESS',
  });
  expect('patientNumber' in rows[0].patient).toBe(false);
  expect(await c.patients('2026-11-09', 'REGISTERED')).toEqual([]);
  await s.intake.create({
    patientId: 'demo-patient-4',
    departmentId: 'demo-internal',
    doctorId: doctor.doctorId,
  });
  const current = await c.patients('2026-11-09');
  expect(current).toHaveLength(2);
  expect(current.find((row) => !row.appointmentId)?.receptionId).toBeTruthy();
});
it('reuses existing Visit and rejects another doctor or missing Visit without creating one', async () => {
  const { s, c, v } = await setup();
  expect(await c.visit(v.id)).toEqual(v);
  await expect(
    s.clinical(async () => mockAccounts.DOCTOR).visit(v.id),
  ).rejects.toMatchObject({ status: 403 });
  await expect(c.complete('not-a-visit', input)).rejects.toMatchObject({
    status: 404,
  });
  expect((await c.visit(v.id)).status).toBe('IN_PROGRESS');
});
it('completes once with v1 and preserves every relation, nursing version and employee/nurse projections', async () => {
  const { s, c, v, r, a, p, nurse } = await setup();
  const nursing = s.nursing(async () => mockAccounts.NURSE);
  const n = await nursing.create(r.id, { content: '[가상] 간호 확인' });
  const old = await nursing.version(n.id, 1);
  const result = await c.complete(v.id, {
    ...input,
    ...{ author: mockAccounts.ADMIN, createdAt: '1900' },
  });
  expect(result.visit).toMatchObject({
    id: v.id,
    receptionId: r.id,
    status: 'COMPLETED',
    completedAt: '2026-11-09T12:00:00.000+09:00',
    clinicalRecordId: result.version.recordId,
  });
  expect(result.version).toMatchObject({
    ...input,
    versionNo: 1,
    correctionReason: null,
    author: { id: doctor.id, doctorId: doctor.doctorId },
  });
  expect((await s.booking.detail(a.id)).displayStatus).toBe('COMPLETED');
  expect((await nurse.detail(r.id)).displayStatus).toBe('COMPLETED');
  expect((await s.intake.detail(r.id)).visitId).toBe(v.id);
  expect(
    (await s.dashboard()).receptionPreview.some(
      (x) => x.id === r.id && x.displayStatus === 'COMPLETED',
    ),
  ).toBe(true);
  expect(
    (await s.visits(p.id, { page: 1, size: 100 })).data.some(
      (x) => x.visitId === v.id,
    ),
  ).toBe(true);
  expect(
    (
      await s.doctor(async () => doctor).schedule('2026-11-09', '2026-11-09')
    ).visits.find((x) => x.id === v.id)?.status,
  ).toBe('COMPLETED');
  expect(await nursing.version(n.id, 1)).toEqual(old);
  expect((await c.record(result.version.recordId)).versions).toHaveLength(1);
  await expect(c.complete(v.id, input)).rejects.toMatchObject({
    code: 'VISIT_ALREADY_COMPLETED',
    status: 409,
  });
});
it('keeps both Visit and record unchanged on save failure and releases doctor busy after completion', async () => {
  const { s, c, v, nurse } = await setup();
  const b = await s.intake.create({
    patientId: 'demo-patient-4',
    departmentId: 'demo-internal',
    doctorId: doctor.doctorId,
  });
  await expect(nurse.call(b.id)).rejects.toMatchObject({ code: 'DOCTOR_BUSY' });
  s.development!.setScenario('save-error');
  await expect(c.complete(v.id, input)).rejects.toMatchObject({ status: 500 });
  s.development!.setScenario('normal');
  expect(await c.visit(v.id)).toEqual(v);
  expect((await c.history(v.patient.id)).data).toEqual([]);
  await c.complete(v.id, input);
  await nurse.call(b.id);
  expect((await nurse.detail(b.id)).status).toBe('CALLED');
});
it('handles concurrent completion with a single winner and immutable original', async () => {
  const { c, v } = await setup();
  const results = await Promise.allSettled([
    c.complete(v.id, input),
    c.complete(v.id, { ...input, diagnosis: '[가상] 다른 요청' }),
  ]);
  expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((x) => x.status === 'rejected')).toMatchObject({
    reason: { code: 'VISIT_ALREADY_COMPLETED' },
  });
  expect((await c.history(v.patient.id)).data).toHaveLength(1);
  const record = await c.record((await c.visit(v.id)).clinicalRecordId!);
  record.latestVersion.diagnosis = 'outside mutation';
  expect((await c.record(record.id)).latestVersion.diagnosis).not.toBe(
    'outside mutation',
  );
});
it.each(['STAFF', 'NURSE', 'ADMIN'] as const)(
  'denies clinical read/write for %s and never leaks body through staff results',
  async (role) => {
    const { s, c, v, p } = await setup();
    const result = await c.complete(v.id, input);
    const other = s.clinical(async () => mockAccounts[role]);
    for (const action of [
      () => other.patients('2026-11-09'),
      () => other.visit(v.id),
      () => other.history(p.id),
      () => other.complete(v.id, input),
      () => other.record(result.version.recordId),
    ])
      await expect(action()).rejects.toMatchObject({ status: 403 });
    expect(
      JSON.stringify(await s.visits(p.id, { page: 1, size: 100 })),
    ).not.toContain(input.diagnosis);
  },
);
it('rejects non-string or missing fields but accepts empty strings as specified', async () => {
  const { c, v } = await setup();
  await expect(
    c.complete(v.id, { symptoms: '', diagnosis: '' } as never),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    c.complete(v.id, { ...input, opinion: null } as never),
  ).rejects.toMatchObject({ status: 400 });
  await c.complete(v.id, { symptoms: '', diagnosis: '', opinion: '' });
  expect((await c.visit(v.id)).status).toBe('COMPLETED');
});
it('reads nursing versions with doctor rights but refuses nursing writes', async () => {
  const { s, r } = await setup();
  const n = s.nursing(async () => mockAccounts.NURSE);
  const row = await n.create(r.id, { content: '[가상] 원본' });
  await n.correct(row.id, {
    baseVersionNo: 1,
    content: '[가상] 정정',
    correctionReason: '가상 보완',
  });
  const d = s.nursing(async () => doctor);
  expect((await d.list(r.id)).data[0].id).toBe(row.id);
  expect((await d.detail(row.id)).latestVersion.versionNo).toBe(2);
  expect((await d.version(row.id, 1)).content).toBe('[가상] 원본');
  await expect(d.create(r.id, { content: '불허' })).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    d.correct(row.id, {
      baseVersionNo: 2,
      content: '불허',
      correctionReason: '불허',
    }),
  ).rejects.toMatchObject({ status: 403 });
});
it('includes earlier/later completed history by other doctors, uses cursor order and excludes in-progress visits', async () => {
  const { s, p, c, v } = await setup();
  expect((await c.history(p.id)).data).toEqual([]);
  for (const [date, id] of [
    ['2026-11-08', 'demo-doctor-2'],
    ['2026-11-10', 'demo-doctor-2'],
  ] as const) {
    vi.setSystemTime(new Date(`${date}T03:00:00Z`));
    const r = await s.intake.create({
      patientId: p.id,
      departmentId: id === 'demo-doctor-2' ? 'demo-pediatric' : 'demo-internal',
      doctorId: id,
    });
    const n = s.nurse(async () => ({
      ...mockAccounts.NURSE,
      department: {
        id: r.department.id,
        name: r.department.name,
        status: 'ACTIVE',
      },
    }));
    await n.call(r.id);
    const visit = await n.enter(r.id);
    await s
      .clinical(async () => ({ ...doctor, doctorId: id }))
      .complete(visit.id, input);
  }
  const latest = await c.history(p.id, { limit: 1 });
  const older = await c.history(p.id, {
    limit: 1,
    before: latest.meta.nextBefore!,
  });
  expect(
    [...older.data, ...latest.data].map((x) => x.completedAt.slice(0, 10)),
  ).toEqual(['2026-11-08', '2026-11-10']);
  expect(latest.data.some((x) => x.visitId === v.id)).toBe(false);
  await expect(c.history('unrelated-patient')).rejects.toMatchObject({
    status: 403,
  });
});
it('rechecks in-flight doctor identity and sends only exact completion fields over HTTP', async () => {
  const { s, v } = await setup();
  let count = 0;
  await expect(
    s
      .clinical(async () => (++count === 1 ? doctor : mockAccounts.DOCTOR))
      .complete(v.id, input),
  ).rejects.toMatchObject({ status: 403 });
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue({
    data: { data: [], meta: { hasMore: false, nextBefore: null } },
  });
  const post = vi
    .spyOn(apiClient, 'post')
    .mockResolvedValue({ data: { data: {} } });
  const ac = new AbortController();
  await apiClinicalService.patients('2026-11-09', 'IN_PROGRESS', ac.signal);
  await apiClinicalService.visit('v/a', ac.signal);
  await apiClinicalService.history(
    'p/a',
    { limit: 5, before: 'cursor' },
    ac.signal,
  );
  await apiClinicalService.complete('v/a', { ...input, ...{ author: doctor } });
  expect(post).toHaveBeenCalledWith('/visits/v%2Fa/complete', input);
  expect(get).toHaveBeenCalledWith('/doctors/me/patients', {
    params: { date: '2026-11-09', status: 'IN_PROGRESS' },
    signal: ac.signal,
  });
  expect(get).toHaveBeenCalledWith('/patients/p%2Fa/clinical-history', {
    params: { limit: 5, before: 'cursor' },
    signal: ac.signal,
  });
});
async function ui(path?: string) {
  const f = await setup();
  const auth = createMockAuthService({ latencyMs: 0 });
  await auth.login({ identifier: 'doctor', password: '1234' });
  auth.me = async () => doctor;
  const client = createQueryClient();
  render(
    <MemoryRouter initialEntries={[path ?? `/doctor/visits/${f.v.id}`]}>
      <AppProviders service={auth} client={client}>
        <AppRoutes staffService={f.s} />
      </AppProviders>
    </MemoryRouter>,
  );
  return { ...f, client };
}
it('renders own patient list and restricts filter results', async () => {
  await ui('/doctor/patients?date=2026-11-09');
  await screen.findByRole('table', { name: '담당 환자' });
  expect(screen.getByText('가상진료환자')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('진행 상태'), {
    target: { value: 'COMPLETED' },
  });
  await screen.findByText('조건에 맞는 환자가 없습니다.');
});
it('keeps draft on failure then completes once, refreshes private cache and shows readonly original/nursing', async () => {
  const { s, c, v, client, r } = await ui();
  await screen.findByLabelText('증상');
  await s
    .nursing(async () => mockAccounts.NURSE)
    .create(r.id, { content: '[가상] 확인 간호' });
  fireEvent.change(screen.getByLabelText('증상'), {
    target: { value: input.symptoms },
  });
  fireEvent.change(screen.getByLabelText('진단'), {
    target: { value: input.diagnosis },
  });
  fireEvent.change(screen.getByLabelText('소견'), {
    target: { value: input.opinion },
  });
  s.development!.setScenario('save-error');
  fireEvent.click(screen.getByRole('button', { name: '진료 완료' }));
  let dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: '완료 확정' }));
  await within(dialog).findByRole('alert');
  expect((screen.getByLabelText('소견') as HTMLTextAreaElement).value).toBe(
    input.opinion,
  );
  s.development!.setScenario('normal');
  const button = within(dialog).getByRole('button', { name: '완료 확정' });
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByText('진료 기록을 저장하고 진료를 완료했습니다.');
  await screen.findByText(input.diagnosis);
  expect(screen.queryByLabelText('증상')).toBeNull();
  expect((await c.visit(v.id)).status).toBe('COMPLETED');
  await screen.findByText('[가상] 확인 간호');
  expect(client.getMutationCache().getAll()).toEqual([]);
  expect(
    client
      .getQueryCache()
      .findAll({ queryKey: queryKeys.resource(doctor.id, 'doctor-clinical') })
      .length,
  ).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
  await screen.findByRole('heading', { name: '로그인' });
  expect(client.getQueryCache().getAll()).toEqual([]);
});
