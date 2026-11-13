import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  render,
  fireEvent,
  screen,
  within,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { createMockStaffService } from '../../services/mock/staff';
import { mockAccounts, createMockAuthService } from '../../services/mock/auth';
import { AppRoutes } from '../../app/router/routes';
import { AppProviders } from '../../app/providers/AppProviders';
import { normalizedSlots, scheduleItems } from './schedule';
import { apiDoctorService } from './service';
import { apiClient } from '../../services/api/client';
vi.mock('../../services/mode', () => ({ apiMode: 'mock' }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T03:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const date = '2026-11-10';
const own = {
  ...mockAccounts.DOCTOR,
  role: 'DOCTOR' as const,
  doctorId: 'demo-doctor-3',
};
const slot = { dayOfWeek: 2, startTime: '13:00', endTime: '16:00' };
const setup = () => {
  const s = createMockStaffService({ latencyMs: 0 });
  return { s, d: s.doctor(async () => own) };
};
it('returns own range only with availability/leaves and no synthetic business writes', async () => {
  const { s, d } = setup();
  const a = await s.booking.create({
    patientId: 'demo-patient-3',
    departmentId: 'demo-internal',
    doctorId: own.doctorId,
    startsAt: `${date}T14:00:00+09:00`,
  });
  const week = await d.schedule('2026-11-09', '2026-11-15');
  expect(week.appointments.map((a) => a.id)).toContain(a.id);
  expect(week.receptions).toEqual([]);
  expect((await d.schedule(date, date)).appointments).toHaveLength(1);
  await expect(d.availability('demo-doctor-2')).rejects.toMatchObject({
    status: 403,
  });
});
it('merges adjacent slots and replaces the entire timetable, updating staff and nurse slots', async () => {
  const { s, d } = setup();
  const r = await d.save([
    { ...slot, endTime: '14:00' },
    { ...slot, startTime: '14:00' },
  ]);
  expect(r.weeklySlots).toEqual([slot]);
  expect((await s.booking.availability(own.doctorId)).weeklySlots).toEqual([
    slot,
  ]);
  const nurse = s.nurseBooking(async () => mockAccounts.NURSE);
  for (const b of [s.booking, nurse.booking]) {
    const slots = await b.slots(own.doctorId, date);
    expect(
      slots.slots.find((s) => s.startsAt.includes('T14:00'))?.available,
    ).toBe(true);
    expect(
      slots.slots.find((s) => s.startsAt.includes('T09:00'))?.available,
    ).toBe(false);
  }
  await d.save([]);
  expect((await d.availability(own.doctorId)).weeklySlots).toEqual([]);
});
it.each([
  { ...slot, dayOfWeek: 7 },
  { ...slot, startTime: '13:10' },
  { ...slot, endTime: '12:00' },
  { ...slot, startTime: '24:00', endTime: '24:00' },
])('rejects invalid boundaries without modifying state', async (bad) => {
  const { d } = setup();
  const old = await d.availability(own.doctorId);
  await expect(d.save([bad])).rejects.toMatchObject({ status: 400 });
  expect(await d.availability(own.doctorId)).toEqual(old);
});
it('rejects duplicate/overlap and permits end 24:00', () => {
  expect(() => normalizedSlots([slot, slot])).toThrow(/중복/);
  expect(() =>
    normalizedSlots([slot, { ...slot, startTime: '14:00', endTime: '17:00' }]),
  ).toThrow(/겹/);
  expect(
    normalizedSlots([{ dayOfWeek: 0, startTime: '23:40', endTime: '24:00' }]),
  ).toHaveLength(1);
});
it('preserves future booking and original availability on conflict including empty replacement', async () => {
  const { s, d } = setup();
  const a = await s.booking.create({
    patientId: 'demo-patient-3',
    departmentId: 'demo-internal',
    doctorId: own.doctorId,
    startsAt: `${date}T14:00:00+09:00`,
  });
  const before = await d.availability(own.doctorId);
  await expect(d.save([])).rejects.toMatchObject({
    code: 'AVAILABILITY_CONFLICT',
    status: 409,
  });
  expect(await d.availability(own.doctorId)).toEqual(before);
  expect((await s.booking.detail(a.id)).status).toBe('BOOKED');
  await s.booking.cancel(a.id);
  await d.save([]);
});
it('applies full-day leave to staff/nurse slots and rejects duplicate without adding extra leaves', async () => {
  const { s, d } = setup();
  const l = await d.leave(date);
  expect((await d.leaves(own.doctorId, date, date))[0]).toEqual(l);
  expect((await d.schedule(date, date)).leaves).toEqual([l]);
  for (const b of [
    s.booking,
    s.nurseBooking(async () => mockAccounts.NURSE).booking,
  ])
    expect(
      (await b.slots(own.doctorId, date)).slots.every((s) => !s.available),
    ).toBe(true);
  await expect(d.leave(date)).rejects.toMatchObject({ status: 409 });
  expect(await d.leaves(own.doctorId, date, date)).toHaveLength(1);
});
it('refuses leave if any noncancelled booking exists and preserves the booking', async () => {
  const { s, d } = setup();
  const a = await s.booking.create({
    patientId: 'demo-patient-3',
    departmentId: 'demo-internal',
    doctorId: own.doctorId,
    startsAt: `${date}T14:00:00+09:00`,
  });
  await expect(d.leave(date)).rejects.toMatchObject({
    code: 'LEAVE_HAS_BOOKING',
  });
  expect(await d.leaves(own.doctorId, date, date)).toEqual([]);
  expect((await s.booking.detail(a.id)).id).toBe(a.id);
});
it.each(['STAFF', 'NURSE', 'ADMIN'] as const)(
  'rejects %s writes and own schedule',
  async (role) => {
    const { s } = setup();
    const d = s.doctor(async () => mockAccounts[role]);
    await expect(d.save([])).rejects.toMatchObject({ status: 403 });
    await expect(d.leave(date)).rejects.toMatchObject({ status: 403 });
    await expect(d.schedule(date, date)).rejects.toMatchObject({ status: 403 });
  },
);
it('enforces read roles/department and handles server errors without modifying state', async () => {
  const { s, d } = setup();
  await s.doctor(async () => mockAccounts.STAFF).availability(own.doctorId);
  await s
    .doctor(async () => mockAccounts.NURSE)
    .leaves(own.doctorId, date, date);
  await expect(
    s.doctor(async () => mockAccounts.NURSE).availability('demo-doctor-2'),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    s.doctor(async () => mockAccounts.ADMIN).availability(own.doctorId),
  ).rejects.toMatchObject({ status: 403 });
  s.development!.setScenario('save-error');
  await expect(d.save([])).rejects.toMatchObject({ status: 500 });
  s.development!.setScenario('normal');
  expect(
    (await d.availability(own.doctorId)).weeklySlots.length,
  ).toBeGreaterThan(0);
});
it('merges booking/checkin once and keeps walkin and Visit relationships', async () => {
  const { s, d } = setup();
  const a = await s.booking.create({
    patientId: 'demo-patient-3',
    departmentId: 'demo-internal',
    doctorId: own.doctorId,
    startsAt: '2026-11-09T14:00:00+09:00',
  });
  const r = await s.intake.create({ appointmentId: a.id });
  const onsite = await s.intake.create({
    patientId: 'demo-patient-4',
    departmentId: 'demo-internal',
    doctorId: own.doctorId,
  });
  const nurse = s.nurse(async () => mockAccounts.NURSE);
  await nurse.call(r.id);
  const v = await nurse.enter(r.id);
  const result = await d.schedule('2026-11-09', '2026-11-09');
  const items = scheduleItems(result);
  expect(items).toHaveLength(2);
  expect(items.find((i) => i.appointmentId === a.id)).toMatchObject({
    receptionId: r.id,
    visitId: v.id,
    status: 'IN_PROGRESS',
  });
  expect(items.find((i) => i.id === onsite.id)?.appointmentId).toBeUndefined();
  expect(result.visits[0].id).toBe(v.id);
  expect(JSON.stringify(result)).not.toContain('patientNumber');
});
it('uses exact API paths, whole replacement body, date ranges and abort signal', async () => {
  const get = vi
    .spyOn(apiClient, 'get')
    .mockResolvedValue({ data: { data: [] } });
  const put = vi
    .spyOn(apiClient, 'put')
    .mockResolvedValue({ data: { data: {} } });
  const post = vi
    .spyOn(apiClient, 'post')
    .mockResolvedValue({ data: { data: {} } });
  const c = new AbortController();
  await apiDoctorService.availability('a/b', c.signal);
  await apiDoctorService.save([slot]);
  await apiDoctorService.leaves('a/b', date, date, c.signal);
  await apiDoctorService.leave(date);
  await apiDoctorService.schedule(date, date, c.signal);
  expect(get).toHaveBeenCalledWith('/doctors/a%2Fb/availability', {
    signal: c.signal,
  });
  expect(put).toHaveBeenCalledWith('/doctors/me/availability', {
    weeklySlots: [slot],
  });
  expect(post).toHaveBeenCalledWith('/doctors/me/leaves', { date });
  expect(get).toHaveBeenCalledWith('/doctors/me/schedule', {
    params: { from: date, to: date },
    signal: c.signal,
  });
});
async function ui(path: string) {
  const { s } = setup();
  const auth = createMockAuthService({ latencyMs: 0 });
  await auth.login({ identifier: 'doctor', password: '1234' });
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders service={auth}>
        <AppRoutes staffService={s} />
      </AppProviders>
    </MemoryRouter>,
  );
  return s;
}
it('renders own weekly/day schedule, shifts dates, requests leave once and refreshes calendar', async () => {
  const s = await ui('/doctor/schedule?date=2026-11-10');
  await screen.findByRole('table', { name: '주간 시간표' });
  fireEvent.click(screen.getByRole('link', { name: '일간' }));
  await screen.findByRole('table', { name: '오늘의 시간표' });
  fireEvent.click(screen.getByRole('button', { name: '다음 기간' }));
  expect((screen.getByLabelText('선택 날짜') as HTMLInputElement).value).toBe(
    '2026-11-11',
  );
  fireEvent.click(screen.getByRole('button', { name: '휴진 신청' }));
  const modal = await screen.findByRole('dialog');
  const b = within(modal).getByRole('button', { name: '휴진 등록' });
  await waitFor(() => expect(b.hasAttribute('disabled')).toBe(false));
  fireEvent.click(b);
  fireEvent.click(b);
  await screen.findByText('휴진을 등록했습니다.');
  expect(
    await s
      .doctor(async () => mockAccounts.DOCTOR)
      .leaves('demo-doctor', '2026-11-11', '2026-11-11'),
  ).toHaveLength(1);
});
it('edits 20-minute cells and preserves draft when future bookings conflict', async () => {
  const s = await ui('/doctor/availability');
  await screen.findByRole('table', { name: '주간 진료 가능 시간 편집' });
  await s.booking.create({
    patientId: 'demo-patient-3',
    departmentId: 'demo-internal',
    doctorId: 'demo-doctor',
    startsAt: '2026-11-10T14:00:00+09:00',
  });
  const cell = screen.getByLabelText('화요일 14:00');
  fireEvent.click(cell);
  expect(cell.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(screen.getByText('변경사항 저장'));
  await screen.findByText(/미래 예약과 충돌/);
  expect(cell.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(screen.getByText('변경 취소'));
  expect(cell.getAttribute('aria-pressed')).toBe('true');
});
it('rejects in-flight session changes and invalid ranges', async () => {
  const { s, d } = setup();
  await expect(d.schedule('2026-99-01', date)).rejects.toMatchObject({
    status: 400,
  });
  let count = 0;
  const switched = s.doctor(async () =>
    ++count === 1 ? own : mockAccounts.DOCTOR,
  );
  await expect(switched.save([])).rejects.toMatchObject({ status: 403 });
  expect(
    (await d.availability(own.doctorId)).weeklySlots.length,
  ).toBeGreaterThan(0);
});
it('preserves empty timetable policy and slot checks across concurrent booking/save or leave', async () => {
  const { s, d } = setup();
  const booking = () =>
    s.booking.create({
      patientId: 'demo-patient-3',
      departmentId: 'demo-internal',
      doctorId: own.doctorId,
      startsAt: `${date}T14:00:00+09:00`,
    });
  const results = await Promise.allSettled([booking(), d.save([])]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const latest = await d.schedule(date, date);
  if (latest.appointments.length) {
    expect(
      (await d.availability(own.doctorId)).weeklySlots.length,
    ).toBeGreaterThan(0);
  } else {
    expect((await d.availability(own.doctorId)).weeklySlots).toEqual([]);
  }
});
it('supports off-hours and weekend availability in the shared booking calculation', async () => {
  const { s, d } = setup();
  await d.save([
    { dayOfWeek: 2, startTime: '12:00', endTime: '13:00' },
    { dayOfWeek: 0, startTime: '23:40', endTime: '24:00' },
  ]);
  expect(
    (await s.booking.slots(own.doctorId, date)).slots.find((s) =>
      s.startsAt.includes('T12:00'),
    )?.available,
  ).toBe(true);
  expect(
    (await s.booking.slots(own.doctorId, '2026-11-15')).slots.find((s) =>
      s.startsAt.includes('T23:40'),
    )?.available,
  ).toBe(true);
});
