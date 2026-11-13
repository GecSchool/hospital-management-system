import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useRef } from 'react';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRoutes } from '../../app/router/routes';
import { createMockStaffService } from '../../services/mock/staff';
import { createMockAuthService, mockAccounts } from '../../services/mock/auth';
import type { StaffService } from '../staff/staffService';
import { CurrentTime } from './CurrentTime';
import { includesSlot } from './schedule';

vi.mock('../../services/mode', () => ({ apiMode: 'mock' }));
const doctor = {
  ...mockAccounts.DOCTOR,
  role: 'DOCTOR' as const,
  doctorId: 'demo-doctor-3',
};
const timestamp = (date: string) => new Date(`${date}T03:00:00Z`);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(timestamp('2026-11-09'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function mount(service: StaffService, path: string) {
  const auth = createMockAuthService({ latencyMs: 0 });
  await auth.login({ identifier: 'doctor', password: '1234' });
  auth.me = async () => doctor;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders service={auth}>
        <AppRoutes staffService={service} />
      </AppProviders>
    </MemoryRouter>,
  );
}
async function fixture() {
  const service = createMockStaffService({ latencyMs: 0 });
  const patient = await service.create({
    name: '가상UI환자',
    residentNumber: '900101-0000000',
    phone: '010-0000-9999',
  });
  const clinical = service.clinical(async () => doctor);
  const nurse = service.nurse(async () => mockAccounts.NURSE);
  const records = [];
  for (const [date, diagnosis] of [
    ['2026-11-05', '[가상] 이전 진단'],
    ['2026-11-06', '[가상] 최근 진단'],
  ]) {
    vi.setSystemTime(timestamp(date));
    const reception = await service.intake.create({
      patientId: patient.id,
      departmentId: 'demo-internal',
      doctorId: doctor.doctorId,
    });
    await nurse.call(reception.id);
    const visit = await nurse.enter(reception.id);
    const result = await clinical.complete(visit.id, {
      symptoms: '[가상] 증상',
      diagnosis,
      opinion: '[가상] 소견',
    });
    records.push({ visit, recordId: result.version.recordId });
  }
  vi.setSystemTime(timestamp('2026-11-09'));
  const appointment = await service.booking.create({
    patientId: patient.id,
    departmentId: 'demo-internal',
    doctorId: doctor.doctorId,
    startsAt: '2026-11-09T14:00:00+09:00',
  });
  return { service, patient, clinical, nurse, records, appointment };
}
it.each([false, true])(
  'opens permitted history before Visit, selects dates, and makes no Visit (registered=%s)',
  async (registered) => {
    const f = await fixture();
    if (registered)
      await f.service.intake.create({ appointmentId: f.appointment.id });
    const before = await f.service
      .doctor(async () => doctor)
      .schedule('2026-11-05', '2026-11-09');
    const beforeRows = await f.clinical.patients('2026-11-09');
    await mount(f.service, '/doctor/patients?date=2026-11-09');
    fireEvent.click(await screen.findByRole('link', { name: '기록 보기 ›' }));
    const panel = await screen.findByRole('region', { name: '진료 기록 본문' });
    await within(panel).findByText('[가상] 최근 진단');
    expect(screen.queryByLabelText('증상')).toBeNull();
    fireEvent.click(
      await screen.findByRole('link', { name: /2026.11.05.*이전 진단/ }),
    );
    await within(panel).findByText('[가상] 이전 진단');
    expect(
      screen
        .getByRole('link', { name: /2026.11.05.*이전 진단/ })
        .getAttribute('aria-current'),
    ).toBe('true');
    const after = await f.service
      .doctor(async () => doctor)
      .schedule('2026-11-05', '2026-11-09');
    expect(after.visits).toEqual(before.visits);
    expect(await f.clinical.patients('2026-11-09')).toEqual(beforeRows);
    fireEvent.click(screen.getByRole('link', { name: '진료 화면 닫기' }));
    await screen.findByRole('table', { name: '담당 환자' });
  },
);
it('shows an empty first-visit history without enabling completion', async () => {
  const service = createMockStaffService({ latencyMs: 0 });
  const a = await service.booking.create({
    patientId: 'demo-patient-4',
    departmentId: 'demo-internal',
    doctorId: doctor.doctorId,
    startsAt: '2026-11-09T14:00:00+09:00',
  });
  await mount(
    service,
    `/doctor/patients?date=2026-11-09&patient=${a.patient.id}&appointment=${a.id}`,
  );
  await screen.findByText(
    '완료된 진료 이력이 없습니다. 입실 확인 전에는 진료 기록을 작성할 수 없습니다.',
  );
  expect(screen.queryByRole('button', { name: '진료 완료' })).toBeNull();
});
it('keeps a clinical draft on continue and confirms departure without completing Visit', async () => {
  const f = await fixture();
  const r = await f.service.intake.create({ appointmentId: f.appointment.id });
  await f.nurse.call(r.id);
  const visit = await f.nurse.enter(r.id);
  await mount(f.service, `/doctor/visits/${visit.id}`);
  fireEvent.change(await screen.findByLabelText('증상'), {
    target: { value: '[가상] 미저장 내용' },
  });
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  fireEvent.click(
    await screen.findByRole('link', { name: /2026.11.05.*이전 진단/ }),
  );
  let dialog = await screen.findByRole('dialog', {
    name: '작성 중인 진료를 나갈까요?',
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '계속 작성' }));
  expect((screen.getByLabelText('증상') as HTMLTextAreaElement).value).toBe(
    '[가상] 미저장 내용',
  );
  fireEvent.click(screen.getByRole('link', { name: '진료 일정' }));
  dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: '나가기' }));
  await screen.findByRole('table', { name: '주간 시간표' });
  expect((await f.clinical.visit(visit.id)).status).toBe('IN_PROGRESS');
  const after = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
});
it('guards correction cancel/close and leaves immutable versions intact', async () => {
  const f = await fixture();
  const latest = f.records[1];
  await mount(f.service, `/doctor/records/${latest.recordId}/correct`);
  fireEvent.change(await screen.findByLabelText('정정 사유'), {
    target: { value: '미저장 정정 사유' },
  });
  fireEvent.click(screen.getByRole('link', { name: '취소' }));
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', {
      name: '계속 작성',
    }),
  );
  expect((screen.getByLabelText('정정 사유') as HTMLInputElement).value).toBe(
    '미저장 정정 사유',
  );
  fireEvent.click(screen.getByRole('link', { name: '정정 화면 닫기' }));
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', {
      name: '나가기',
    }),
  );
  await screen.findByRole('region', { name: '진료 기록 본문' });
  expect((await f.clinical.record(latest.recordId)).versions).toHaveLength(1);
});
it('opens a booking from weekly calendar and daily list, preserving return route', async () => {
  const f = await fixture();
  await mount(f.service, '/doctor/schedule?date=2026-11-09');
  const grid = await screen.findByRole('table', { name: '주간 시간표' });
  fireEvent.click(within(grid).getByRole('link', { name: f.patient.name }));
  await screen.findByText('[가상] 최근 진단');
  fireEvent.click(screen.getByRole('link', { name: '진료 화면 닫기' }));
  await screen.findByRole('table', { name: '주간 시간표' });
  fireEvent.click(screen.getByRole('link', { name: '일간' }));
  await screen.findByRole('table', { name: '오늘의 시간표' });
  fireEvent.click(screen.getByRole('link', { name: '보기 ›' }));
  await screen.findByText('[가상] 최근 진단');
  fireEvent.click(screen.getByRole('link', { name: '진료 화면 닫기' }));
  await screen.findByRole('table', { name: '오늘의 시간표' });
  expect((await f.clinical.patients('2026-11-09'))[0]).toMatchObject({
    appointmentId: f.appointment.id,
    displayStatus: 'BOOKED',
  });
  expect((await f.clinical.patients('2026-11-09'))[0].visitId).toBeUndefined();
});
it('lets the user select among patients sharing a weekly cell without losing resource IDs', async () => {
  const service = createMockStaffService({ latencyMs: 0 });
  const rs = [];
  for (const patientId of ['demo-patient-3', 'demo-patient-4'])
    rs.push(
      await service.intake.create({
        patientId,
        departmentId: 'demo-internal',
        doctorId: doctor.doctorId,
      }),
    );
  await mount(service, '/doctor/schedule?date=2026-11-09');
  const trigger = await screen.findByRole('button', {
    name: '월 12:00 환자 2명 선택',
  });
  fireEvent.click(trigger);
  let dialog = await screen.findByRole('dialog', {
    name: '환자를 선택해 주세요',
  });
  expect(document.activeElement).toBe(dialog);
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  await screen.findByRole('dialog');
  fireEvent.pointerDown(screen.getByRole('button', { name: '오늘' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(trigger);
  dialog = await screen.findByRole('dialog');
  const links = within(dialog).getAllByRole('link');
  expect(links).toHaveLength(2);
  for (const r of rs)
    expect(
      links.some((link) =>
        link.getAttribute('href')?.includes(`reception=${r.id}`),
      ),
    ).toBe(true);
  fireEvent.click(links[1]);
  await screen.findByText(
    '완료된 진료 이력이 없습니다. 입실 확인 전에는 진료 기록을 작성할 수 없습니다.',
  );
});
it('preserves pointer-drag selection and saves 20-minute availability', async () => {
  const service = createMockStaffService({ latencyMs: 0 });
  await mount(service, '/doctor/availability');
  const first = await screen.findByRole('button', { name: '화요일 13:00' });
  const second = screen.getByRole('button', { name: '화요일 13:20' });
  fireEvent.pointerDown(first, { button: 0 });
  fireEvent.pointerEnter(second);
  fireEvent.pointerUp(window);
  expect(first.getAttribute('aria-pressed')).toBe('false');
  expect(second.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));
  await screen.findByText('진료 가능 시간을 저장했습니다.');
  const slots = (
    await service.doctor(async () => doctor).availability(doctor.doctorId)
  ).weeklySlots;
  expect(includesSlot(slots, 2, '13:00')).toBe(false);
  expect(includesSlot(slots, 2, '13:20')).toBe(false);
  expect(includesSlot(slots, 2, '13:40')).toBe(true);
});
it('recovers a follow-up slot conflict and returns to the original Visit after success acknowledgement', async () => {
  const f = await fixture();
  const previous = f.records[1];
  await mount(f.service, `/doctor/visits/${previous.visit.id}/follow-up`);
  fireEvent.change(await screen.findByLabelText('진료 날짜'), {
    target: { value: '2026-11-10' },
  });
  fireEvent.click(await screen.findByRole('button', { name: '14:00' }));
  fireEvent.click(screen.getByRole('button', { name: '예약 등록' }));
  await f.service.booking.create({
    patientId: 'demo-patient-4',
    departmentId: 'demo-internal',
    doctorId: doctor.doctorId,
    startsAt: '2026-11-10T14:00:00+09:00',
  });
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', {
      name: '등록 확정',
    }),
  );
  await screen.findByText(/선택한 시간은 더 이상 예약할 수 없습니다/);
  fireEvent.click(screen.getByRole('button', { name: '시간대 다시 조회' }));
  const nextSlot = await screen.findByRole('button', { name: '14:20' });
  await waitFor(() => expect(nextSlot.hasAttribute('disabled')).toBe(false));
  fireEvent.click(nextSlot);
  fireEvent.click(screen.getByRole('button', { name: '예약 등록' }));
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', {
      name: '등록 확정',
    }),
  );
  const success = await screen.findByRole('dialog', {
    name: '재진 예약이 완료되었습니다',
  });
  fireEvent.click(within(success).getByRole('button', { name: '확인' }));
  await screen.findByRole('region', { name: '진료 기록 본문' });
  await screen.findByText('재진 예약이 완료되었습니다.');
  expect((await f.clinical.visit(previous.visit.id)).status).toBe('COMPLETED');
});
function ClockFixture({ date }: { date: string }) {
  const table = useRef<HTMLTableElement>(null);
  return (
    <>
      <table ref={table}>
        <tbody>
          <tr>
            <td data-slot-start="580">09:40</td>
          </tr>
        </tbody>
      </table>
      <CurrentTime date={date} table={table} />
    </>
  );
}
it('positions live Seoul time within its slot and updates once per minute', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-09T00:48:00Z'));
  const view = render(<ClockFixture date="2026-11-09" />);
  expect(
    (screen.getByRole('img', { name: '현재 시각 09:48' }) as HTMLElement).style
      .top,
  ).toBe('40%');
  act(() => vi.advanceTimersByTime(60_000));
  expect(
    (screen.getByRole('img', { name: '현재 시각 09:49' }) as HTMLElement).style
      .top,
  ).toBe('45%');
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it.each(['2026-11-08', '2026-11-10'])(
  'hides current time for a non-today date %s',
  (date) => {
    render(<ClockFixture date={date} />);
    expect(screen.queryByRole('img')).toBeNull();
  },
);
