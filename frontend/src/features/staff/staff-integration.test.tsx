import { act, renderHook, waitFor } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '../../app/providers/AppProviders';
import { createQueryClient } from '../../app/providers/queryClient';
import { createMockStaffService } from '../../services/mock/staff';
import { createMockAuthService } from '../../services/mock/auth';
import { bookingKey, useBookingWrite } from '../appointments/queries';
import { receptionKey } from '../receptions/queries';
import { staffKeys, refreshPatient } from './queries';
import { mockAccounts } from '../../services/mock/auth';
const page = { page: 1, size: 100 };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T03:00:00Z'));
});
afterEach(() => vi.useRealTimers());
async function patient(s = createMockStaffService({ latencyMs: 0 })) {
  return {
    s,
    p: await s.create({
      name: '가상통합환자',
      residentNumber: '900101-0000000',
      phone: '010-0000-1122',
    }),
  };
}
describe('Phase 3B-3 fixed-clock integration', () => {
  it('keeps identity across patient registration, appointment changes, check-in, removal, recheck-in and cancellation', async () => {
    const { s, p } = await patient();
    const input = {
      patientId: p.id,
      departmentId: 'demo-internal',
      doctorId: 'demo-doctor',
      startsAt: '2026-11-09T14:00:00+09:00',
    };
    expect((await s.appointments(p.id, page)).data).toEqual([]);
    const a = await s.booking.create(input);
    const changed = await s.booking.reschedule(
      a.id,
      '2026-11-09T14:20:00+09:00',
    );
    expect(changed).toMatchObject({
      id: a.id,
      patient: { id: p.id },
      doctor: a.doctor,
    });
    const r = await s.intake.create({ appointmentId: a.id });
    expect(await s.booking.detail(a.id)).toMatchObject({
      displayStatus: 'REGISTERED',
      receptionId: r.id,
    });
    await expect(s.booking.cancel(a.id)).rejects.toMatchObject({
      code: 'APPOINTMENT_ALREADY_RECEIVED',
    });
    await expect(
      s.booking.reschedule(a.id, input.startsAt),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_ALREADY_RECEIVED' });
    expect(
      (await s.dashboard()).receptionPreview.some((x) => x.id === r.id),
    ).toBe(true);
    await s.intake.remove(r.id);
    expect((await s.receptions(p.id, page)).data).toEqual([]);
    expect(await s.booking.detail(a.id)).toMatchObject({
      id: a.id,
      status: 'BOOKED',
      displayStatus: 'BOOKED',
      receptionId: null,
    });
    expect(
      (await s.booking.slots(a.doctor.id, '2026-11-09')).slots.find(
        (x) => x.startsAt === changed.startsAt,
      )?.available,
    ).toBe(false);
    const next = await s.intake.create({ appointmentId: a.id });
    expect(next.id).not.toBe(r.id);
    await s.intake.remove(next.id);
    await s.booking.cancel(a.id);
    expect(await s.booking.detail(a.id)).toMatchObject({
      id: a.id,
      status: 'CANCELLED',
      displayStatus: 'CANCELLED',
    });
    expect(
      (await s.booking.slots(a.doctor.id, '2026-11-09')).slots.find(
        (x) => x.startsAt === changed.startsAt,
      )?.available,
    ).toBe(true);
    const onsite = await s.intake.create({
      patientId: p.id,
      departmentId: input.departmentId,
      doctorId: input.doctorId,
    });
    expect(onsite.appointmentId).toBeNull();
    expect((await s.appointments(p.id, page)).meta.totalItems).toBe(1);
    await expect(
      s.intake.create({
        patientId: p.id,
        departmentId: input.departmentId,
        doctorId: input.doctorId,
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_ACTIVE_RECEPTION' });
    await s.update(p.id, { name: '가상통합수정' });
    expect((await s.list({ name: '가상통합수정' }, page)).data[0].id).toBe(
      p.id,
    );
    expect((await s.detail(p.id)).name).toBe('가상통합수정');
    expect((await s.intake.detail(onsite.id)).patient.name).toBe(
      '가상통합수정',
    );
    expect((await s.booking.detail(a.id)).patient.name).toBe('가상통합수정');
  });
  it('refreshes mounted reservation/reception/history/dashboard queries after check-in and deletion, and after patient editing', async () => {
    const { s, p } = await patient();
    const a = await s.booking.create({
      patientId: p.id,
      departmentId: 'demo-internal',
      doctorId: 'demo-doctor',
      startsAt: '2026-11-09T14:00:00+09:00',
    });
    const auth = createMockAuthService({ latencyMs: 0 });
    await auth.login({ identifier: 'staff', password: '1234' });
    const id = mockAccounts.STAFF.id;
    const client = createQueryClient();
    const { result, unmount } = renderHook(
      () => ({
        write: useBookingWrite(),
        booking: useQuery({
          queryKey: [...bookingKey(id), 'detail', a.id],
          queryFn: () => s.booking.detail(a.id),
        }),
        intakes: useQuery({
          queryKey: [...receptionKey(id), 'list'],
          queryFn: () => s.intake.list({ date: '2026-11-09' }, page),
        }),
        history: useQuery({
          queryKey: [...staffKeys.patients(id), 'history', p.id],
          queryFn: () => s.receptions(p.id, page),
        }),
        dashboard: useQuery({
          queryKey: staffKeys.dashboard(id),
          queryFn: () => s.dashboard(),
        }),
      }),
      {
        wrapper: ({ children }) => (
          <AppProviders service={auth} client={client}>
            {children}
          </AppProviders>
        ),
      },
    );
    await waitFor(() =>
      expect(result.current.booking.data?.displayStatus).toBe('BOOKED'),
    );
    await act(async () => {
      await result.current.write.run(
        () => s.intake.create({ appointmentId: a.id }),
        () => {},
      );
    });
    await waitFor(() =>
      expect(result.current.booking.data?.displayStatus).toBe('REGISTERED'),
    );
    const receptionId = result.current.booking.data!.receptionId!;
    expect(
      result.current.history.data!.data.some((x) => x.id === receptionId),
    ).toBe(true);
    expect(
      result.current.intakes.data!.data.some((x) => x.id === receptionId),
    ).toBe(true);
    expect(
      result.current.dashboard.data!.receptionPreview.some(
        (x) => x.id === receptionId,
      ),
    ).toBe(true);
    await act(async () => {
      const updated = await s.update(p.id, { name: '가상캐시수정' });
      await refreshPatient(client, id, updated, () => true);
    });
    await waitFor(() =>
      expect(result.current.booking.data?.patient.name).toBe('가상캐시수정'),
    );
    expect(result.current.history.data!.data[0].patient.name).toBe(
      '가상캐시수정',
    );
    await act(async () => {
      await result.current.write.run(
        () => s.intake.remove(receptionId),
        () => {},
      );
    });
    await waitFor(() =>
      expect(result.current.booking.data?.displayStatus).toBe('BOOKED'),
    );
    expect(result.current.history.data!.data).toEqual([]);
    expect(
      result.current.intakes.data!.data.some((x) => x.id === receptionId),
    ).toBe(false);
    expect(
      result.current.dashboard.data!.receptionPreview.some(
        (x) => x.id === receptionId,
      ),
    ).toBe(false);
    unmount();
    client.clear();
  });
});
