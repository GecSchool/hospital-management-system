import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/routes';
import { AppProviders } from '../../app/providers/AppProviders';
import { createQueryClient } from '../../app/providers/queryClient';
import { createMockStaffService } from '../../services/mock/staff';
import { createMockAuthService } from '../../services/mock/auth';
import type { Role } from '../../types/auth';
import { ApiError } from '../../services/api/errors';
vi.mock('../../services/mode', () => ({ apiMode: 'mock' }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T03:00:00Z'));
});
afterEach(() => vi.useRealTimers());
const onsite = {
  patientId: 'demo-patient-3',
  departmentId: 'demo-internal',
  doctorId: 'demo-doctor',
};
async function start(
  path = '/staff/receptions',
  s = createMockStaffService({ latencyMs: 0 }),
  role: Role = 'STAFF',
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
async function book(
  s = createMockStaffService({ latencyMs: 0 }),
  date = '2026-11-09',
) {
  return {
    s,
    a: await s.booking.create({
      ...onsite,
      startsAt: `${date}T14:00:00+09:00`,
    }),
  };
}
async function fillWalkin() {
  const dialog = screen.getByRole('dialog', { name: '현장 접수' });
  await within(dialog).findByRole('option', { name: '내과' });
  fireEvent.change(within(dialog).getByLabelText('진료과'), {
    target: { value: 'demo-internal' },
  });
  await within(dialog).findByRole('option', { name: '가상의사' });
  fireEvent.change(within(dialog).getByLabelText('담당 의사'), {
    target: { value: 'demo-doctor' },
  });
  return dialog;
}
describe('직원 접수 화면', () => {
  it('renders current date, statuses, tab links and required date filter', async () => {
    await start();
    const table = await screen.findByRole('table', { name: '접수 현황' });
    expect(within(table).getAllByRole('row')).toHaveLength(6);
    expect((screen.getByLabelText('조회 날짜') as HTMLInputElement).value).toBe(
      '2026-11-09',
    );
    expect(
      (screen.getByLabelText('조회 날짜') as HTMLInputElement).required,
    ).toBe(true);
    expect(
      screen.getByRole('link', { name: '예약 현황' }).getAttribute('href'),
    ).toBe('/staff/appointments');
    expect(within(table).getByText('호출됨')).toBeTruthy();
  });
  it('checks in a reservation only after confirmation and reflects its connected IDs and history', async () => {
    const { s, a } = await book();
    const create = vi.spyOn(s.intake, 'create');
    await start(`/staff/appointments/${a.id}`, s);
    fireEvent.click(
      await screen.findByRole('button', { name: '예약 환자 접수' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: '예약 환자를 접수할까요?',
    });
    expect(create).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: '접수' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '접수 중…' }));
    await screen.findByText('예약 환자 접수가 완료되었습니다.');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ appointmentId: a.id });
    expect((await s.booking.detail(a.id)).displayStatus).toBe('REGISTERED');
    expect(
      (await s.receptions(a.patient.id, { page: 1, size: 100 })).data.some(
        (r) => r.appointmentId === a.id,
      ),
    ).toBe(true);
  });
  it('disables early and cancelled reservation check-in with guidance', async () => {
    const { s, a } = await book(undefined, '2026-11-10');
    await start(`/staff/appointments/${a.id}`, s);
    await screen.findByText('예약일 당일에만 접수할 수 있습니다.');
    expect(
      screen
        .getByRole('button', { name: '예약 환자 접수' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });
  it('prevents check-in of cancelled reservations', async () => {
    const { s, a } = await book();
    await s.booking.cancel(a.id);
    await start(`/staff/appointments/${a.id}`, s);
    await screen.findByText('취소된 예약은 접수할 수 없습니다.');
    expect(
      screen
        .getByRole('button', { name: '예약 환자 접수' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });
  it('registers a walk-in from patient detail without creating a booking and resets a reopened form', async () => {
    const { s } = await start('/staff/patients/demo-patient-3');
    fireEvent.click(await screen.findByRole('button', { name: '현장 접수' }));
    let dialog = await fillWalkin();
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    fireEvent.click(screen.getByRole('button', { name: '현장 접수' }));
    expect(
      (
        within(screen.getByRole('dialog')).getByLabelText(
          '진료과',
        ) as HTMLSelectElement
      ).value,
    ).toBe('');
    dialog = await fillWalkin();
    const before = (
      await s.booking.list(
        { patientName: '가상환자003' },
        { page: 1, size: 100 },
      )
    ).meta.totalItems;
    fireEvent.click(within(dialog).getByRole('button', { name: '접수' }));
    await screen.findByText('현장 접수가 완료되었습니다.');
    expect(
      (
        await s.booking.list(
          { patientName: '가상환자003' },
          { page: 1, size: 100 },
        )
      ).meta.totalItems,
    ).toBe(before);
    fireEvent.click(screen.getByRole('tab', { name: '접수 이력' }));
    await screen.findByRole('table', { name: '접수 이력' });
    expect(
      (await s.receptions(onsite.patientId, { page: 1, size: 100 })).data[0]
        .appointmentId,
    ).toBeNull();
  });
  it('validates required department/doctor and resets doctor when department changes', async () => {
    await start('/staff/patients/demo-patient-3');
    fireEvent.click(await screen.findByRole('button', { name: '현장 접수' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '접수' }));
    await within(dialog).findByText('진료과를 선택해 주세요.');
    expect(within(dialog).getByText('담당 의사를 선택해 주세요.')).toBeTruthy();
    await fillWalkin();
    fireEvent.change(within(dialog).getByLabelText('진료과'), {
      target: { value: 'demo-pediatric' },
    });
    expect(
      (within(dialog).getByLabelText('담당 의사') as HTMLSelectElement).value,
    ).toBe('');
  });
  it('applies name/birthdate/status AND search, resets pagination, and supports past dates', async () => {
    await start('/staff/receptions?page=2');
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('환자명'), {
      target: { value: '가상환자001' },
    });
    fireEvent.change(screen.getByLabelText('생년월일'), {
      target: { value: '1985-03-14' },
    });
    fireEvent.change(screen.getByLabelText('진행 상태'), {
      target: { value: 'REGISTERED' },
    });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));
    await screen.findByText('총 2건');
    expect(
      screen
        .getByRole('button', { name: '1페이지' })
        .getAttribute('aria-current'),
    ).toBe('page');
    fireEvent.change(screen.getByLabelText('조회 날짜'), {
      target: { value: '2020-01-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));
    await screen.findByText('조건에 맞는 접수가 없습니다.');
  });
  it('paginates distinct reception IDs and opens the selected detail', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    for (let i = 3; i <= 6; i++)
      await s.intake.create({ ...onsite, patientId: `demo-patient-${i}` });
    await start('/staff/receptions', s);
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: '2페이지' }));
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: '2페이지' })
          .getAttribute('aria-current'),
      ).toBe('page'),
    );
    fireEvent.click(screen.getAllByRole('link', { name: /접수 상세/ })[0]);
    const dialog = await screen.findByRole('dialog', { name: '접수 상세' });
    await within(dialog).findByText('환자번호');
    expect(within(dialog).getByText('접수 시각')).toBeTruthy();
  });
  it('deletes an appointment reception and allows recheck-in while preserving the original booking', async () => {
    const { s, a } = await book();
    const r = await s.intake.create({ appointmentId: a.id });
    await start(`/staff/receptions/${r.id}`, s);
    const detail = await screen.findByRole('dialog', { name: '접수 상세' });
    await within(detail).findByText('예약');
    fireEvent.click(within(detail).getByRole('button', { name: '접수 삭제' }));
    const confirmation = screen.getByRole('dialog', {
      name: '접수를 삭제할까요?',
    });
    expect(
      within(confirmation).getByText('접수를 삭제해도 원래 예약은 유지됩니다.'),
    ).toBeTruthy();
    fireEvent.click(within(confirmation).getByRole('button', { name: '삭제' }));
    await screen.findByText('접수가 삭제되었습니다. 연결된 예약은 유지됩니다.');
    expect(await s.booking.detail(a.id)).toMatchObject({
      id: a.id,
      receptionId: null,
      displayStatus: 'BOOKED',
    });
    expect((await s.intake.create({ appointmentId: a.id })).id).not.toBe(r.id);
  });
  it('shows the nursing-record deletion restriction returned by the service', async () => {
    await start('/staff/receptions/demo-reception-demo-patient-1');
    const detail = await screen.findByRole('dialog', { name: '접수 상세' });
    await within(detail).findByText('예약');
    fireEvent.click(within(detail).getByRole('button', { name: '접수 삭제' }));
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    await screen.findByRole('dialog', { name: '접수를 삭제할 수 없습니다.' });
    expect(screen.getByRole('alert').textContent).toBe(
      '간호 기록이 작성된 접수는 삭제할 수 없습니다.',
    );
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
  });
  it('disables deletion after a visit starts', async () => {
    await start('/staff/receptions/demo-reception-demo-patient-2-2');
    const dialog = await screen.findByRole('dialog', { name: '접수 상세' });
    await within(dialog).findByText('진료 중');
    expect(
      within(dialog)
        .getByRole('button', { name: '접수 삭제' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });
  it('confirms called reception deletion and releases it from the list', async () => {
    const { s } = await start('/staff/receptions/demo-walkin-demo-patient');
    const detail = await screen.findByRole('dialog', { name: '접수 상세' });
    await within(detail).findByText('호출됨');
    fireEvent.click(within(detail).getByRole('button', { name: '접수 삭제' }));
    expect(
      screen.getByText('호출된 접수를 삭제하면 해당 호출도 해제됩니다.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    await screen.findByText('접수가 삭제되었습니다. 연결된 예약은 유지됩니다.');
    await expect(
      s.intake.detail('demo-walkin-demo-patient'),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('handles stale duplicate-registration errors without reporting success', async () => {
    const { s, a } = await book();
    await start(`/staff/appointments/${a.id}`, s);
    fireEvent.click(
      await screen.findByRole('button', { name: '예약 환자 접수' }),
    );
    await s.intake.create({ appointmentId: a.id });
    fireEvent.click(screen.getByRole('button', { name: '접수' }));
    await screen.findByText(
      '같은 환자·의사의 미완료 접수가 이미 있거나 이미 접수된 예약입니다.',
    );
    expect(screen.queryByText('예약 환자 접수가 완료되었습니다.')).toBeNull();
  });
  it('reports errors, retries list reads, and does not mutate after failed deletion', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    s.development!.setScenario('error');
    await start('/staff/receptions', s);
    await screen.findAllByRole('alert');
    s.development!.setScenario('normal');
    fireEvent.click(
      screen.getAllByRole('button', { name: '다시 시도' }).at(-1)!,
    );
    await screen.findByRole('table');
  });
  it('handles a visit-start conflict occurring after opening delete confirmation', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    vi.spyOn(s.intake, 'remove').mockRejectedValueOnce(
      new ApiError('VISIT_ALREADY_STARTED', 'conflict', 409),
    );
    await start('/staff/receptions/demo-walkin-demo-patient', s);
    const detail = await screen.findByRole('dialog', { name: '접수 상세' });
    await within(detail).findByText('호출됨');
    fireEvent.click(within(detail).getByRole('button', { name: '접수 삭제' }));
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    await screen.findByText('진료가 시작된 접수는 삭제할 수 없습니다.');
  });
  it.each(['NURSE', 'DOCTOR', 'ADMIN'] as Role[])(
    'blocks %s before reading or writing staff receptions',
    async (role) => {
      const s = createMockStaffService({ latencyMs: 0 });
      const list = vi.spyOn(s.intake, 'list');
      const create = vi.spyOn(s.intake, 'create');
      await start('/staff/receptions', s, role);
      await screen.findByRole('heading', { name: '403' });
      expect(list).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );
});
