import { createQueryClient } from '../../app/providers/queryClient';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { createMockStaffService } from '../../services/mock/staff';
import { mockAccounts, createMockAuthService } from '../../services/mock/auth';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRoutes } from '../../app/router/routes';
vi.mock('../../services/mode', () => ({ apiMode: 'mock' }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T03:00:00Z'));
});
afterEach(() => vi.useRealTimers());
const input = {
  patientId: 'demo-patient-3',
  departmentId: 'demo-internal',
  doctorId: 'demo-doctor-3',
  startsAt: '2026-11-09T14:00:00+09:00',
};
const setup = () => {
  const s = createMockStaffService({ latencyMs: 0 });
  return { s, n: s.nurseBooking(async () => mockAccounts.NURSE) };
};
it('searches all patients without patient numbers and limits doctors/departments', async () => {
  const { n } = setup();
  const p = await n.list({ name: '가상환자003' }, { page: 1, size: 5 });
  expect(p.data).toHaveLength(1);
  expect('patientNumber' in p.data[0]).toBe(false);
  expect((await n.booking.departments()).map((d) => d.id)).toEqual([
    'demo-internal',
  ]);
  expect(
    (await n.booking.doctors('demo-internal')).every(
      (d) => d.department.id === 'demo-internal',
    ),
  ).toBe(true);
  await expect(n.booking.doctors('demo-pediatric')).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    n.list({ patientNumber: 'P1' } as never, { page: 1, size: 5 }),
  ).rejects.toMatchObject({ status: 403 });
});
it('preserves all identity links across nurse booking, staff intake, records, call and entry', async () => {
  const { s, n } = setup();
  const a = await n.booking.create(input);
  expect(a.registeredBy.id).toBe(mockAccounts.NURSE.id);
  expect('patientNumber' in a.patient).toBe(false);
  expect(a.receptionId).toBeNull();
  expect((await s.booking.detail(a.id)).patient.id).toBe(input.patientId);
  const r = await s.intake.create({ appointmentId: a.id });
  const nurse = s.nurse(async () => mockAccounts.NURSE);
  expect(
    (
      await nurse.list({ date: '2026-11-09' }, { page: 1, size: 100 })
    ).data.some((x) => x.id === r.id),
  ).toBe(true);
  const record = await s
    .nursing(async () => mockAccounts.NURSE)
    .create(r.id, { content: '[가상] 예약 환자 확인' });
  await expect(s.intake.remove(r.id)).rejects.toMatchObject({
    code: 'RECEPTION_HAS_NURSING_RECORDS',
  });
  await nurse.call(r.id);
  const v = await nurse.enter(r.id);
  expect(v.receptionId).toBe(r.id);
  expect((await n.booking.detail(a.id)).displayStatus).toBe('IN_PROGRESS');
  expect(record.receptionId).toBe(r.id);
});
it('rejects foreign creation/detail and nurse change/cancel', async () => {
  const { s, n } = setup();
  await expect(
    n.booking.create({
      ...input,
      departmentId: 'demo-pediatric',
      doctorId: 'demo-doctor-2',
    }),
  ).rejects.toMatchObject({ status: 403 });
  const a = await s.booking.create({
    ...input,
    departmentId: 'demo-pediatric',
    doctorId: 'demo-doctor-2',
  });
  await expect(n.booking.detail(a.id)).rejects.toMatchObject({ status: 403 });
  await expect(
    n.booking.reschedule(a.id, input.startsAt),
  ).rejects.toMatchObject({ status: 403 });
  await expect(n.booking.cancel(a.id)).rejects.toMatchObject({ status: 403 });
});
it.each(['STAFF', 'DOCTOR', 'ADMIN'] as const)(
  'rejects %s at nurse boundary',
  async (role) => {
    const { s } = setup();
    await expect(
      s.nurseBooking(async () => mockAccounts[role]).booking.create(input),
    ).rejects.toMatchObject({ status: 403 });
  },
);
it('reuses slot conflicts, errors and patient pagination', async () => {
  const { s, n } = setup();
  await n.booking.create(input);
  await expect(n.booking.create(input)).rejects.toMatchObject({
    code: 'SLOT_UNAVAILABLE',
  });
  expect(
    (await n.booking.slots(input.doctorId, '2026-11-09')).slots.find(
      (x) => x.startsAt === input.startsAt,
    )?.available,
  ).toBe(false);
  expect((await n.list({}, { page: 2, size: 5 })).data).toHaveLength(5);
  s.development!.setScenario('save-error');
  await expect(
    n.booking.create({ ...input, startsAt: '2026-11-09T14:20:00+09:00' }),
  ).rejects.toMatchObject({ status: 500 });
});
it('renders patient selection and shared form, saves once, and reads nurse detail without staff actions', async () => {
  const { s, n } = setup();
  const nurseBooking = s.nurseBooking.bind(s);
  const detail = vi.fn().mockRejectedValue(new Error('상세 조회 권한 없음'));
  s.nurseBooking = (principal) => ({ ...nurseBooking(principal), detail });
  const auth = createMockAuthService({ latencyMs: 0 });
  await auth.login({ identifier: 'nurse', password: '1234' });
  const client = createQueryClient();
  render(
    <MemoryRouter initialEntries={['/nurse/appointments/new']}>
      <AppProviders service={auth} client={client}>
        <AppRoutes staffService={s} />
      </AppProviders>
    </MemoryRouter>,
  );
  await screen.findByRole('table', { name: '예약 환자 선택' });
  expect(screen.queryByText(/P000/)).toBeNull();
  fireEvent.change(screen.getByLabelText('이름'), {
    target: { value: '가상환자003' },
  });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  await waitFor(() =>
    expect(screen.getAllByRole('link', { name: '선택 ›' })).toHaveLength(1),
  );
  fireEvent.click(screen.getByRole('link', { name: '선택 ›' }));
  await screen.findByRole('heading', { name: '예약 등록' });
  await waitFor(() =>
    expect((screen.getByLabelText('환자') as HTMLInputElement).value).toContain(
      '가상환자003',
    ),
  );
  expect(detail).not.toHaveBeenCalled();
  await screen.findByRole('option', { name: '가상의사3' });
  fireEvent.change(screen.getByLabelText('담당 의사'), {
    target: { value: 'demo-doctor-3' },
  });
  fireEvent.click(await screen.findByRole('button', { name: '14:00' }));
  fireEvent.click(screen.getByRole('button', { name: '예약 등록' }));
  const modal = await screen.findByRole('dialog');
  const submit = within(modal).getByRole('button', { name: '등록 확정' });
  fireEvent.click(submit);
  fireEvent.click(submit);
  await screen.findByText('예약이 등록되었습니다.');
  const rows = await n.booking.list(
    {
      patientName: '가상환자003',
      doctorId: 'demo-doctor-3',
      date: '2026-11-09',
    },
    { page: 1, size: 100 },
  );
  expect(rows.data).toHaveLength(1);
  const row = (await screen.findByText('가상환자003')).closest('tr')!;
  fireEvent.click(within(row).getByRole('link', { name: '상세 보기 ›' }));
  await screen.findByRole('dialog', { name: '예약 상세' });
  expect(screen.queryByRole('button', { name: '예약 취소' })).toBeNull();
  expect(screen.queryByRole('button', { name: '예약 변경' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
  await screen.findByRole('heading', { name: '로그인' });
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  fireEvent.change(screen.getByLabelText('아이디'), {
    target: { value: 'staff' },
  });
  fireEvent.change(screen.getByLabelText('비밀번호'), {
    target: { value: '1234' },
  });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
  await screen.findByRole('heading', { name: '대시보드' });
  expect((await s.booking.detail(rows.data[0].id)).registeredBy.id).toBe(
    mockAccounts.NURSE.id,
  );
});

it('asks for patient selection when opening a booking URL without a cached selection', async () => {
  const { s } = setup();
  const auth = createMockAuthService({ latencyMs: 0 });
  await auth.login({ identifier: 'nurse', password: '1234' });
  render(
    <MemoryRouter initialEntries={['/nurse/appointments/new/demo-patient-3']}>
      <AppProviders service={auth} client={createQueryClient()}>
        <AppRoutes staffService={s} />
      </AppProviders>
    </MemoryRouter>,
  );
  expect((await screen.findByRole('alert')).textContent).toContain(
    '환자를 다시 선택해 주세요',
  );
  fireEvent.click(screen.getByRole('link', { name: '환자 검색' }));
  expect(
    await screen.findByRole('table', { name: '예약 환자 선택' }),
  ).toBeTruthy();
});
