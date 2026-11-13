import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '../../app/providers/AppProviders';
import { createQueryClient } from '../../app/providers/queryClient';
import { AppRoutes } from '../../app/router/routes';
import { createMockAuthService } from '../../services/mock/auth';
import { createMockStaffService } from '../../services/mock/staff';
import type { Role } from '../../types/auth';
vi.mock('../../services/mode', () => ({ apiMode: 'mock' }));
const future = '2099-01-05';
async function start(
  path = '/staff/appointments/new',
  role: Role = 'STAFF',
  service = createMockStaffService({ latencyMs: 0 }),
) {
  const auth = createMockAuthService({ latencyMs: 0 });
  await auth.login({ identifier: role.toLowerCase(), password: '1234' });
  const client = createQueryClient();
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders service={auth} client={client}>
        <AppRoutes staffService={service} />
      </AppProviders>
    </MemoryRouter>,
  );
  return service;
}
async function select() {
  fireEvent.click(await screen.findByRole('button', { name: '환자 찾기' }));
  const dialog = screen.getByRole('dialog', { name: '환자 선택' });
  fireEvent.click(
    await within(dialog).findByRole('button', {
      name: '가상환자001 · P0001042',
    }),
  );
  fireEvent.change(screen.getByLabelText('진료과'), {
    target: { value: 'demo-internal' },
  });
  await screen.findByRole('option', { name: '가상의사' });
  fireEvent.change(screen.getByLabelText('담당 의사'), {
    target: { value: 'demo-doctor' },
  });
  fireEvent.change(screen.getByLabelText('진료 날짜'), {
    target: { value: future },
  });
  return screen.findByRole('button', { name: '09:00' });
}
async function seed(service = createMockStaffService({ latencyMs: 0 })) {
  const a = await service.booking.create({
    patientId: 'demo-patient',
    doctorId: 'demo-doctor',
    departmentId: 'demo-internal',
    startsAt: `${future}T09:00:00+09:00`,
  });
  return { service, a };
}
describe('직원 예약 화면', () => {
  it('selects a patient and doctor, clears time on date/department changes, and prevents incomplete submission', async () => {
    await start();
    expect(
      (await screen.findByRole('button', { name: '예약 등록' })).hasAttribute(
        'disabled',
      ),
    ).toBe(true);
    fireEvent.click(await select());
    expect(
      screen
        .getByRole('button', { name: '예약 등록' })
        .hasAttribute('disabled'),
    ).toBe(false);
    fireEvent.change(screen.getByLabelText('진료 날짜'), {
      target: { value: '2099-01-06' },
    });
    expect(
      screen
        .getByRole('button', { name: '예약 등록' })
        .hasAttribute('disabled'),
    ).toBe(true);
    fireEvent.click(await screen.findByRole('button', { name: '09:20' }));
    fireEvent.change(screen.getByLabelText('진료과'), {
      target: { value: 'demo-pediatric' },
    });
    expect(
      (screen.getByLabelText('담당 의사') as HTMLSelectElement).value,
    ).toBe('');
    expect(screen.queryByRole('button', { name: '09:20' })).toBeNull();
  });
  it('registers only after confirmation, locks duplicate submissions and updates history', async () => {
    const service = await start();
    const create = vi.spyOn(service.booking, 'create');
    fireEvent.click(await select());
    fireEvent.click(screen.getByRole('button', { name: '예약 등록' }));
    const confirm = screen.getByRole('dialog');
    fireEvent.click(within(confirm).getByRole('button', { name: '등록 확정' }));
    fireEvent.click(within(confirm).getByRole('button', { name: '처리 중…' }));
    await screen.findByText('예약이 등록되었습니다.');
    expect(create).toHaveBeenCalledTimes(1);
    expect(
      (
        await service.appointments('demo-patient', { page: 1, size: 100 })
      ).data.some((x) => x.startsAt === `${future}T09:00:00+09:00`),
    ).toBe(true);
  });
  it('preselects the patient when entered from detail', async () => {
    await start('/staff/patients/demo-patient');
    fireEvent.click(await screen.findByRole('link', { name: '예약 등록' }));
    await waitFor(() =>
      expect(
        (screen.getByLabelText('환자') as HTMLInputElement).value,
      ).toContain('가상환자001'),
    );
  });
  it('filters by patient/status and resets URL page without exposing patient name', async () => {
    await start('/staff/appointments?page=2');
    await screen.findByRole('table', { name: '전체 예약' });
    fireEvent.change(screen.getByLabelText('환자'), {
      target: { value: '가상환자001' },
    });
    fireEvent.change(screen.getByLabelText('상태'), {
      target: { value: 'COMPLETED' },
    });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));
    await waitFor(() => expect(screen.getByText('총 1건')).toBeTruthy());
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(
      2,
    );
  });
  it('paginates the appointment list', async () => {
    await start('/staff/appointments');
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: '2페이지' }));
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: '2페이지' })
          .getAttribute('aria-current'),
      ).toBe('page'),
    );
  });
  it('shows details and disables changes for received appointments', async () => {
    await start('/staff/appointments/demo-appointment-demo-patient-0');
    const dialog = await screen.findByRole('dialog', { name: '예약 상세' });
    await within(dialog).findByText('진료 완료');
    expect(
      within(dialog)
        .getByRole('button', { name: '예약 변경' })
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(
      within(dialog)
        .getByRole('button', { name: '예약 취소' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });
  it('disables unchanged time, changes only timestamp, and refreshes detail', async () => {
    const { service, a } = await seed();
    await start(`/staff/appointments/${a.id}/reschedule`, 'STAFF', service);
    const save = await screen.findByRole('button', { name: '변경 저장' });
    expect(save.hasAttribute('disabled')).toBe(true);
    fireEvent.click(await screen.findByRole('button', { name: '09:20' }));
    fireEvent.click(save);
    fireEvent.click(screen.getByRole('button', { name: '변경 확정' }));
    await screen.findByText('예약 시간이 변경되었습니다.');
    expect((await service.booking.detail(a.id)).startsAt).toBe(
      `${future}T09:20:00+09:00`,
    );
    expect((await service.booking.detail(a.id)).patient.id).toBe(a.patient.id);
  });
  it('cancels with confirmation, retains record and updates list status', async () => {
    const { service, a } = await seed();
    await start(`/staff/appointments/${a.id}`, 'STAFF', service);
    const dialog = await screen.findByRole('dialog', { name: '예약 상세' });
    await within(dialog).findByText('예약');
    fireEvent.click(within(dialog).getByRole('button', { name: '예약 취소' }));
    const confirmation = screen.getByRole('dialog', {
      name: '예약을 취소할까요?',
    });
    fireEvent.click(
      within(confirmation).getByRole('button', { name: '예약 취소' }),
    );
    await screen.findByText('예약이 취소되었습니다.');
    expect((await service.booking.detail(a.id)).status).toBe('CANCELLED');
    expect(
      within(screen.getByRole('dialog'))
        .getByRole('button', { name: '예약 취소' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });
  it('shows server errors and retries without falling back to fake success', async () => {
    const service = createMockStaffService({ latencyMs: 0 });
    service.development!.setScenario('error');
    await start('/staff/appointments', 'STAFF', service);
    await screen.findAllByRole('alert');
    service.development!.setScenario('normal');
    fireEvent.click(
      screen.getAllByRole('button', { name: '다시 시도' }).at(-1)!,
    );
    await screen.findByRole('table');
  });
  it('reports a slot conflict at save time', async () => {
    const service = await start();
    fireEvent.click(await select());
    await service.booking.create({
      patientId: 'demo-patient-2',
      departmentId: 'demo-internal',
      doctorId: 'demo-doctor',
      startsAt: `${future}T09:00:00+09:00`,
    });
    fireEvent.click(screen.getByRole('button', { name: '예약 등록' }));
    fireEvent.click(screen.getByRole('button', { name: '등록 확정' }));
    await screen.findByText(
      '선택한 시간은 더 이상 예약할 수 없습니다. 시간을 다시 선택해 주세요.',
    );
  });
  it.each(['DOCTOR', 'NURSE', 'ADMIN'] as Role[])(
    'blocks %s before reading appointment data',
    async (role) => {
      const service = createMockStaffService({ latencyMs: 0 });
      const list = vi.spyOn(service.booking, 'list');
      await start('/staff/appointments', role, service);
      await screen.findByRole('heading', { name: '403' });
      expect(list).not.toHaveBeenCalled();
    },
  );
});
