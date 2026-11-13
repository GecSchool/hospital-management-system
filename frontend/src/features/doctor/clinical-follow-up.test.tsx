import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { createMockStaffService } from '../../services/mock/staff';
import { mockAccounts, createMockAuthService } from '../../services/mock/auth';
import { AppRoutes } from '../../app/router/routes';
import { AppProviders } from '../../app/providers/AppProviders';
import { createQueryClient } from '../../app/providers/queryClient';
import { apiClient } from '../../services/api/client';
import { apiClinicalService } from './clinicalService';
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
  symptoms: '[가상] 증상',
  diagnosis: '[가상] 진단',
  opinion: '[가상] 소견',
};
async function setup(complete = true, onsite = false) {
  const s = createMockStaffService({ latencyMs: 0 });
  const p = await s.create({
    name: '가상정정환자',
    residentNumber: '900101-0000000',
    phone: '010-0000-1212',
  });
  const a = onsite
    ? undefined
    : await s.booking.create({
        patientId: p.id,
        departmentId: 'demo-internal',
        doctorId: doctor.doctorId,
        startsAt: '2026-11-09T14:00:00+09:00',
      });
  const r = await s.intake.create(
    a
      ? { appointmentId: a.id }
      : {
          patientId: p.id,
          departmentId: 'demo-internal',
          doctorId: doctor.doctorId,
        },
  );
  const nurse = s.nurse(async () => mockAccounts.NURSE);
  const n = await s
    .nursing(async () => mockAccounts.NURSE)
    .create(r.id, { content: '[가상] 간호 기록 보존' });
  await nurse.call(r.id);
  const v = await nurse.enter(r.id);
  const c = s.clinical(async () => doctor);
  const result = complete ? await c.complete(v.id, input) : undefined;
  return { s, p, a, r, v, c, result, n };
}
it('appends versions with fixed identity/metadata and preserves original after repeated corrections', async () => {
  const { c, result, v } = await setup();
  const id = result!.version.recordId;
  const original = await c.version(id, 1);
  vi.setSystemTime(new Date('2026-11-09T03:01:00Z'));
  const v2 = await c.correct(id, {
    baseVersionNo: 1,
    ...input,
    diagnosis: '[가상] 보완',
    correctionReason: '관찰 보완',
  });
  const v3 = await c.correct(id, {
    baseVersionNo: 2,
    ...input,
    diagnosis: '[가상] 재보완',
    correctionReason: '표현 정정',
  });
  expect(v3.versionNo).toBe(3);
  expect(v2.author.id).toBe(doctor.id);
  expect(v2.createdAt).toBe('2026-11-09T12:01:00.000+09:00');
  expect(await c.version(id, 1)).toEqual(original);
  expect((await c.record(id)).versions.map((v) => v.versionNo)).toEqual([
    1, 2, 3,
  ]);
  expect((await c.visit(v.id)).completedAt).toBe(result!.visit.completedAt);
  expect((await c.version(id, 2)).correctionReason).toBe('관찰 보완');
});
it('rejects missing reason and stale versions without changing any version', async () => {
  const { c, result } = await setup();
  const id = result!.version.recordId;
  await expect(
    c.correct(id, { baseVersionNo: 1, ...input, correctionReason: ' \n' }),
  ).rejects.toMatchObject({ status: 400 });
  await c.correct(id, {
    baseVersionNo: 1,
    ...input,
    correctionReason: '최초 정정',
  });
  const before = await c.record(id);
  await expect(
    c.correct(id, {
      baseVersionNo: 1,
      ...input,
      correctionReason: '늦은 정정',
    }),
  ).rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
  expect(await c.record(id)).toEqual(before);
});
it('allows one concurrent correction only and never confuses record/version IDs', async () => {
  const { s, c, result } = await setup();
  const id = result!.version.recordId;
  const outcomes = await Promise.allSettled(
    ['A', 'B'].map((reason) =>
      c.correct(id, { baseVersionNo: 1, ...input, correctionReason: reason }),
    ),
  );
  expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  await expect(c.version(id, 99)).rejects.toMatchObject({ status: 404 });
  await expect(c.version('different-record', 1)).rejects.toMatchObject({
    status: 404,
  });
  s.development!.setScenario('save-error');
  await expect(
    c.correct(id, { baseVersionNo: 2, ...input, correctionReason: '실패' }),
  ).rejects.toMatchObject({ status: 500 });
  s.development!.setScenario('normal');
  expect((await c.record(id)).versions).toHaveLength(2);
});
it.each(['STAFF', 'NURSE', 'ADMIN', 'DOCTOR'] as const)(
  'denies unauthorized %s correction/version/follow-up service calls',
  async (role) => {
    const { s, result, v } = await setup();
    const other = s.clinical(async () => mockAccounts[role]);
    await expect(
      other.correct(result!.version.recordId, {
        baseVersionNo: 1,
        ...input,
        correctionReason: '불허',
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      other.version(result!.version.recordId, 1),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      other.followUp(v.id, '2026-11-10T14:00:00+09:00'),
    ).rejects.toMatchObject({ status: 403 });
  },
);
it.each([false, true])(
  'integrates staff→nurse→doctor correction→new booking, including onsite=%s',
  async (onsite) => {
    const { s, p, a, r, v, c, result, n } = await setup(true, onsite);
    const id = result!.version.recordId;
    const nursing = await s.nursing(async () => doctor).version(n.id, 1);
    await c.correct(id, {
      baseVersionNo: 1,
      ...input,
      diagnosis: '[가상] 정정 진단',
      correctionReason: '관찰 보완',
    });
    const before = await c.visit(v.id);
    const booking = await c.followUp(v.id, '2026-11-10T14:00:00+09:00');
    expect(booking).toMatchObject({
      patient: { id: p.id },
      department: { id: r.department.id },
      doctor: { id: doctor.doctorId },
      registeredBy: { id: doctor.id },
      status: 'BOOKED',
      receptionId: null,
    });
    expect(booking.id).not.toBe(a?.id);
    expect(await c.visit(v.id)).toEqual(before);
    expect((await c.record(id)).latestVersion.versionNo).toBe(2);
    expect(await s.nursing(async () => doctor).version(n.id, 1)).toEqual(
      nursing,
    );
    expect((await s.booking.detail(booking.id)).patient.id).toBe(p.id);
    expect(
      (
        await s
          .nurseBooking(async () => mockAccounts.NURSE)
          .booking.list({ date: '2026-11-10' }, { page: 1, size: 100 })
      ).data.some((x) => x.id === booking.id),
    ).toBe(true);
    expect(
      (
        await s.doctor(async () => doctor).schedule('2026-11-10', '2026-11-10')
      ).appointments.some((x) => x.id === booking.id),
    ).toBe(true);
    expect(
      (await c.patients('2026-11-10')).some(
        (x) => x.appointmentId === booking.id,
      ),
    ).toBe(true);
    expect(
      (await s.appointments(p.id, { page: 1, size: 100 })).data.some(
        (x) => x.id === booking.id,
      ),
    ).toBe(true);
    expect((await s.intake.detail(r.id)).visitId).toBe(v.id);
  },
);
it('denies incomplete Visit, leave, busy, past and off-hour slots without modifying old data', async () => {
  const pending = await setup(false);
  await expect(
    pending.c.followUp(pending.v.id, '2026-11-10T14:00:00+09:00'),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    pending.c.followUpSlots(pending.v.id, '2026-11-10'),
  ).rejects.toMatchObject({ status: 400 });
  const { s, c, v } = await setup();
  await s.doctor(async () => doctor).leave('2026-11-10');
  for (const time of [
    '2026-11-10T14:00:00+09:00',
    '2026-11-09T09:00:00+09:00',
    '2026-11-11T12:00:00+09:00',
  ])
    await expect(c.followUp(v.id, time)).rejects.toMatchObject({
      code: 'SLOT_UNAVAILABLE',
    });
  const a = await c.followUp(v.id, '2026-11-11T14:00:00+09:00');
  await expect(c.followUp(v.id, a.startsAt)).rejects.toMatchObject({
    code: 'SLOT_UNAVAILABLE',
  });
  expect(
    (await c.followUpSlots(v.id, '2026-11-11')).slots.find(
      (s) => s.startsAt === a.startsAt,
    )?.available,
  ).toBe(false);
});
it('uses exact VIS06/07/APT06 payloads and encoded paths', async () => {
  const post = vi
    .spyOn(apiClient, 'post')
    .mockResolvedValue({ data: { data: {} } });
  const get = vi
    .spyOn(apiClient, 'get')
    .mockResolvedValue({ data: { data: { doctor: { id: 'd/a' } } } });
  const ac = new AbortController();
  await apiClinicalService.version('r/a', 2, ac.signal);
  await apiClinicalService.correct('r/a', {
    baseVersionNo: 1,
    ...input,
    correctionReason: '정정',
    ...{ author: doctor },
  });
  await apiClinicalService.followUp('v/a', '2026-11-10T14:00:00+09:00');
  await apiClinicalService.followUpSlots('v/a', '2026-11-10', ac.signal);
  expect(get).toHaveBeenCalledWith('/clinical-records/r%2Fa/versions/2', {
    signal: ac.signal,
  });
  expect(post).toHaveBeenCalledWith('/clinical-records/r%2Fa/versions', {
    baseVersionNo: 1,
    ...input,
    correctionReason: '정정',
  });
  expect(post).toHaveBeenCalledWith('/visits/v%2Fa/follow-up-appointments', {
    startsAt: '2026-11-10T14:00:00+09:00',
  });
  expect(get).toHaveBeenCalledWith('/doctors/d%2Fa/appointment-slots', {
    params: { date: '2026-11-10' },
    signal: ac.signal,
  });
});
async function ui(f: Awaited<ReturnType<typeof setup>>, path: string) {
  const auth = createMockAuthService({ latencyMs: 0 });
  await auth.login({ identifier: 'doctor', password: '1234' });
  auth.me = async () => doctor;
  const client = createQueryClient();
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders service={auth} client={client}>
        <AppRoutes staffService={f.s} />
      </AppProviders>
    </MemoryRouter>,
  );
  return client;
}
it('shows previous/latest versions and reason after correction and keeps immutable original', async () => {
  const f = await setup();
  const id = f.result!.version.recordId;
  await f.c.correct(id, {
    baseVersionNo: 1,
    ...input,
    diagnosis: '[가상] 최신 진단',
    correctionReason: '관찰 보완',
  });
  await ui(f, `/doctor/visits/${f.v.id}`);
  const panel = await screen.findByRole('region', { name: '진료 기록 본문' });
  await within(panel).findByText('관찰 보완');
  fireEvent.click(within(panel).getByRole('button', { name: /^원본 ·/ }));
  await within(panel).findByText(input.diagnosis);
  expect(within(panel).queryByText('관찰 보완')).toBeNull();
  expect((await f.c.record(id)).latestVersion.versionNo).toBe(2);
});
it('preserves all four draft fields on conflict and requires explicit latest reload before resubmitting', async () => {
  const f = await setup();
  const id = f.result!.version.recordId;
  const factory = f.s.clinical.bind(f.s);
  let once = true;
  f.s.clinical = (p) => {
    const service = factory(p);
    return {
      ...service,
      async correct(id, data) {
        if (once) {
          once = false;
          await f.c.correct(id, {
            baseVersionNo: 1,
            ...input,
            diagnosis: '[가상] 다른 창의 최신',
            correctionReason: '먼저 저장',
          });
        }
        return service.correct(id, data);
      },
    };
  };
  await ui(f, `/doctor/records/${id}/correct`);
  await screen.findByLabelText('증상');
  fireEvent.click(screen.getByRole('button', { name: '정정 저장' }));
  await screen.findByText('정정 사유를 입력해 주세요.');
  for (const [label, value] of [
    ['증상', '[가상] 내 증상'],
    ['진단', '[가상] 내 진단'],
    ['소견', '[가상] 내 소견'],
    ['정정 사유', '내 사유'],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: '정정 저장' }));
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', {
      name: '정정 확정',
    }),
  );
  await screen.findByText(/최신 기록이 변경되었습니다/);
  for (const [label, value] of [
    ['증상', '[가상] 내 증상'],
    ['진단', '[가상] 내 진단'],
    ['소견', '[가상] 내 소견'],
    ['정정 사유', '내 사유'],
  ])
    expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe(
      value,
    );
  expect(
    screen.getByRole('button', { name: '정정 저장' }).hasAttribute('disabled'),
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '최신 기록 다시 조회' }));
  await screen.findByText('확인한 최신 버전: 2');
  await screen.findByText('[가상] 다른 창의 최신');
  fireEvent.click(screen.getByRole('button', { name: '정정 저장' }));
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', {
      name: '정정 확정',
    }),
  );
  await screen.findByText('정정 기록을 저장했습니다.');
  expect((await f.c.record(id)).latestVersion).toMatchObject({
    versionNo: 3,
    diagnosis: '[가상] 내 진단',
    correctionReason: '내 사유',
  });
});
it('books follow-up once through date/slot confirmation and clears private caches on logout', async () => {
  const f = await setup();
  const client = await ui(f, `/doctor/visits/${f.v.id}/follow-up`);
  await screen.findByLabelText('진료 날짜');
  fireEvent.change(screen.getByLabelText('진료 날짜'), {
    target: { value: '2026-11-10' },
  });
  fireEvent.click(await screen.findByRole('button', { name: '14:00' }));
  fireEvent.click(screen.getByRole('button', { name: '예약 등록' }));
  const modal = await screen.findByRole('dialog');
  const submit = within(modal).getByRole('button', { name: '등록 확정' });
  fireEvent.click(submit);
  fireEvent.click(submit);
  await screen.findByText('재진 예약이 완료되었습니다.');
  expect(
    (await f.s.appointments(f.p.id, { page: 1, size: 100 })).data.filter(
      (a) => a.startsAt === '2026-11-10T14:00:00+09:00',
    ),
  ).toHaveLength(1);
  expect(client.getMutationCache().getAll()).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
  await screen.findByRole('heading', { name: '로그인' });
  expect(client.getQueryCache().getAll()).toEqual([]);
});
