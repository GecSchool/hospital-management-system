import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRoutes } from '../../app/router/routes';
import { createQueryClient } from '../../app/providers/queryClient';
import { createMockStaffService } from '../../services/mock/staff';
import { createMockAuthService } from '../../services/mock/auth';
import type { Role } from '../../types/auth';
vi.mock('../../services/mode', () => ({ apiMode: 'mock' }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T03:00:00Z'));
});
afterEach(() => vi.useRealTimers());
async function start(
  path = '/nurse/patients',
  role: Role = 'NURSE',
  s = createMockStaffService({ latencyMs: 0 }),
) {
  const auth = createMockAuthService({ latencyMs: 0 });
  await auth.login({ identifier: role.toLowerCase(), password: '1234' });
  const client = createQueryClient();
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders service={auth} client={client}>
        <AppRoutes staffService={s} />
      </AppProviders>
    </MemoryRouter>,
  );
  return { s, client };
}
async function seed() {
  const s = createMockStaffService({ latencyMs: 0 });
  for (const patientId of ['demo-patient-3', 'demo-patient-4'])
    await s.intake.create({
      patientId,
      doctorId: 'demo-doctor-3',
      departmentId: 'demo-internal',
    });
  return s;
}
const row = (name: string) => screen.getByRole('link', { name }).closest('tr')!;
it('renders own department with no patient numbers and supports search/status/date', async () => {
  await start();
  await screen.findByRole('table', { name: '접수 환자' });
  expect(screen.getByText('소속 진료과: 내과')).toBeTruthy();
  expect(screen.queryByText('P0001042')).toBeNull();
  fireEvent.change(screen.getByLabelText('이름'), {
    target: { value: '없는가상환자' },
  });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  await screen.findByText('조건에 맞는 접수 환자가 없습니다.');
  fireEvent.change(screen.getByLabelText('조회 날짜'), {
    target: { value: '2020-01-01' },
  });
  await screen.findByText('조건에 맞는 접수 환자가 없습니다.');
});
it('calls, refreshes the list cache, and confirms entry while disabling fast duplicate clicks', async () => {
  const s = await seed();
  await start('/nurse/patients', 'NURSE', s);
  await screen.findByRole('link', { name: '가상환자003' });
  fireEvent.click(
    within(row('가상환자003')).getByRole('button', { name: '호출' }),
  );
  await screen.findByText(
    '환자를 호출했습니다. 같은 의사의 이전 호출은 해제되었습니다.',
  );
  await waitFor(() =>
    expect(
      within(row('가상환자003')).getByRole('button', { name: '입실 확인' }),
    ).toBeTruthy(),
  );
  fireEvent.click(
    within(row('가상환자003')).getByRole('button', { name: '입실 확인' }),
  );
  await screen.findByText('입실을 확인하고 진료를 시작했습니다.');
  expect(within(row('가상환자003')).getByText('진료 중')).toBeTruthy();
  expect(
    (await s.receptions('demo-patient-3', { page: 1, size: 100 })).data[0]
      .visitStatus,
  ).toBe('IN_PROGRESS');
});
it('replaces a prior same-doctor call', async () => {
  const s = await seed();
  await start('/nurse/patients', 'NURSE', s);
  await screen.findByRole('link', { name: '가상환자003' });
  fireEvent.click(
    within(row('가상환자003')).getByRole('button', { name: '호출' }),
  );
  await screen.findByText(
    '환자를 호출했습니다. 같은 의사의 이전 호출은 해제되었습니다.',
  );
  fireEvent.click(
    within(row('가상환자004')).getByRole('button', { name: '호출' }),
  );
  await waitFor(() =>
    expect(within(row('가상환자003')).getByText('접수 완료')).toBeTruthy(),
  );
  expect(within(row('가상환자004')).getByText('호출됨')).toBeTruthy();
});
it('opens the correct reception detail and preserves nursing record placeholder', async () => {
  const s = await seed();
  await start('/nurse/patients', 'NURSE', s);
  fireEvent.click(await screen.findByRole('link', { name: '가상환자003' }));
  const dialog = await screen.findByRole('dialog', { name: '접수 상세' });
  await within(dialog).findByText(/가상환자003/);
  expect(
    within(dialog)
      .getByRole('link', { name: '간호 기록 ›' })
      .getAttribute('href'),
  ).toContain('/records');
});
it('reports DOCTOR_BUSY and server errors without a success message', async () => {
  await start();
  await screen.findByRole('table');
  const links = screen.getAllByRole('button', { name: '호출' });
  fireEvent.click(links[0]);
  await screen.findByText(
    '담당 의사가 진료 중입니다. 잠시 후 다시 확인해 주세요.',
  );
  expect(
    screen.queryByText(
      '환자를 호출했습니다. 같은 의사의 이전 호출은 해제되었습니다.',
    ),
  ).toBeNull();
});
it('shows and retries a mock read failure', async () => {
  const s = createMockStaffService({ latencyMs: 0 });
  s.development!.setScenario('error');
  await start('/nurse/patients', 'NURSE', s);
  await screen.findAllByRole('alert');
  s.development!.setScenario('normal');
  for (const b of screen.getAllByRole('button', { name: '다시 시도' }))
    fireEvent.click(b);
  await screen.findByRole('table');
});
it('blocks direct foreign department detail', async () => {
  const s = createMockStaffService({ latencyMs: 0 });
  const r = await s.intake.create({
    patientId: 'demo-patient-3',
    doctorId: 'demo-doctor-2',
    departmentId: 'demo-pediatric',
  });
  await start(`/nurse/receptions/${r.id}`, 'NURSE', s);
  await screen.findByText('다른 진료과에 접근할 수 없습니다.');
});
it.each(['STAFF', 'DOCTOR', 'ADMIN'] as Role[])(
  'blocks the %s route before nurse reads',
  async (role) => {
    const s = createMockStaffService({ latencyMs: 0 });
    const factory = vi.spyOn(s, 'nurse');
    await start('/nurse/patients', role, s);
    await screen.findByRole('heading', { name: '403' });
    expect(factory).not.toHaveBeenCalled();
  },
);
it('paginates and filters the registered list without including called patients', async () => {
  const s = await seed();
  await start('/nurse/patients', 'NURSE', s);
  await screen.findByRole('table');
  fireEvent.click(screen.getByRole('button', { name: '2페이지' }));
  await waitFor(() =>
    expect(
      screen
        .getByRole('button', { name: '2페이지' })
        .getAttribute('aria-current'),
    ).toBe('page'),
  );
  fireEvent.click(screen.getByRole('button', { name: '접수 완료' }));
  await screen.findByRole('table');
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: '입실 확인' })).toBeNull(),
  );
  expect(
    screen
      .getByRole('button', { name: '1페이지' })
      .getAttribute('aria-current'),
  ).toBe('page');
});
