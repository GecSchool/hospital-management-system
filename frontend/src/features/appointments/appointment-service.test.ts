import { afterEach, describe, expect, it } from 'vitest';
import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { apiClient } from '../../services/api/client';
import { createMockStaffService } from '../../services/mock/staff';
import { apiAppointments } from './service';
import { slotReason } from './queries';
const date = '2099-01-05';
const input = {
  patientId: 'demo-patient',
  departmentId: 'demo-internal',
  doctorId: 'demo-doctor',
  startsAt: `${date}T09:00:00+09:00`,
};
const original = apiClient.defaults.adapter;
afterEach(() => {
  apiClient.defaults.adapter = original;
});
describe('예약 API 계약과 공유 Mock', () => {
  it('uses exact DEP/SCH/APT methods, params, encoded IDs and session cookies', async () => {
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
    const signal = new AbortController().signal;
    await apiAppointments.departments(signal);
    await apiAppointments.doctors('opaque/id', signal);
    await apiAppointments.availability('doc/id', signal);
    await apiAppointments.slots('doc/id', date, 'apt/id', signal);
    await apiAppointments.list(
      { patientName: '가상', status: 'CALLED', date },
      { page: 2, size: 4 },
      signal,
    );
    await apiAppointments.detail('apt/id', signal);
    await apiAppointments.create(input);
    await apiAppointments.reschedule('apt/id', `${date}T09:20:00+09:00`);
    await apiAppointments.cancel('apt/id');
    expect(requests.map((x) => [x.method, x.url])).toEqual([
      ['get', '/departments'],
      ['get', '/departments/opaque%2Fid/doctors'],
      ['get', '/doctors/doc%2Fid/availability'],
      ['get', '/doctors/doc%2Fid/appointment-slots'],
      ['get', '/appointments'],
      ['get', '/appointments/apt%2Fid'],
      ['post', '/appointments'],
      ['patch', '/appointments/apt%2Fid/time'],
      ['post', '/appointments/apt%2Fid/cancel'],
    ]);
    expect(requests[3].params).toEqual({
      date,
      excludeAppointmentId: 'apt/id',
    });
    expect(JSON.parse(requests[7].data)).toEqual({
      startsAt: `${date}T09:20:00+09:00`,
    });
    expect(JSON.parse(requests[8].data)).toEqual({});
    for (const r of requests) expect(r.withCredentials).toBe(true);
    for (const r of requests.slice(0, 6)) expect(r.signal).toBe(signal);
  });
  it('reuses newly registered patients and latest patient edits in list/history', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    const p = await s.create({
      name: '가상예약신규',
      residentNumber: '900101-0000000',
      phone: '010-0000-9999',
    });
    const a = await s.booking.create({ ...input, patientId: p.id });
    await s.update(p.id, { name: '가상예약수정' });
    expect((await s.booking.detail(a.id)).patient.name).toBe('가상예약수정');
    expect((await s.appointments(p.id, { page: 1, size: 5 })).data[0].id).toBe(
      a.id,
    );
  });
  it('rechecks concurrent slot occupancy and does not create duplicates', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    const results = await Promise.allSettled([
      s.booking.create(input),
      s.booking.create({ ...input, patientId: 'demo-patient-2' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (results.find((r) => r.status === 'rejected') as PromiseRejectedResult)
        .reason.code,
    ).toBe('SLOT_UNAVAILABLE');
  });
  it('excludes only the target reservation, preserves identity and keeps other slots occupied', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    const a = await s.booking.create(input);
    await s.booking.create({ ...input, startsAt: `${date}T09:20:00+09:00` });
    const slots = await s.booking.slots('demo-doctor', date, a.id);
    expect(slots.slots[0].available).toBe(true);
    expect(slots.slots[1].available).toBe(false);
    await expect(
      s.booking.reschedule(a.id, `${date}T09:20:00+09:00`),
    ).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' });
    const changed = await s.booking.reschedule(a.id, `${date}T09:40:00+09:00`);
    expect(changed.id).toBe(a.id);
    expect(changed.patient).toEqual(a.patient);
    expect(changed.doctor).toEqual(a.doctor);
    expect(
      (await s.booking.slots('demo-doctor', date)).slots[0].available,
    ).toBe(true);
  });
  it('returns the same reservation when unchanged', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    const a = await s.booking.create(input);
    expect(await s.booking.reschedule(a.id, a.startsAt)).toEqual(a);
  });
  it('retains cancelled record, frees slot and rejects repeated cancellation', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    const a = await s.booking.create(input);
    await s.booking.cancel(a.id);
    expect(await s.booking.detail(a.id)).toMatchObject({
      status: 'CANCELLED',
      displayStatus: 'CANCELLED',
    });
    expect(
      (await s.booking.slots('demo-doctor', date)).slots[0].available,
    ).toBe(true);
    expect(
      (
        await s.booking.list({ status: 'CANCELLED' }, { page: 1, size: 100 })
      ).data.some((x) => x.id === a.id),
    ).toBe(true);
    await expect(s.booking.cancel(a.id)).rejects.toMatchObject({
      code: 'APPOINTMENT_CANCELLED',
    });
  });
  it('forbids changing/cancelling an appointment with a reception', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    const id = 'demo-appointment-demo-patient-0';
    await expect(
      s.booking.reschedule(id, input.startsAt),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_ALREADY_RECEIVED' });
    await expect(s.booking.cancel(id)).rejects.toMatchObject({
      code: 'APPOINTMENT_ALREADY_RECEIVED',
    });
  });
  it('enforces 20 minutes, lunch/outside hours, holiday, leave and past times', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    const slots = await s.booking.slots('demo-doctor', date);
    expect(slots.intervalMinutes).toBe(20);
    expect(slots.slots.find((x) => x.startsAt.includes('T12:00'))?.reason).toBe(
      'OUTSIDE_WORKING_HOURS',
    );
    expect(slots.slots.find((x) => x.startsAt.includes('T15:20'))?.reason).toBe(
      'LEAVE',
    );
    expect(
      (await s.booking.slots('demo-doctor', '2099-01-04')).slots.every(
        (x) => !x.available,
      ),
    ).toBe(true);
    expect(
      (await s.booking.slots('demo-doctor', '2020-01-01')).slots[0].reason,
    ).toBe('PAST_TIME');
    await expect(
      s.booking.create({ ...input, startsAt: `${date}T09:10:00+09:00` }),
    ).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' });
    expect(slotReason('FUTURE_UNKNOWN')).toBe('예약 불가');
  });
  it('simulates failures without modifying data and resets on recreation', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    s.development!.setScenario('save-error');
    await expect(s.booking.create(input)).rejects.toMatchObject({
      status: 500,
    });
    s.development!.setScenario('normal');
    const a = await s.booking.create(input);
    const fresh = createMockStaffService({ latencyMs: 0 });
    await expect(fresh.booking.detail(a.id)).rejects.toMatchObject({
      status: 404,
    });
    s.development!.setScenario('error');
    await expect(s.booking.slots('demo-doctor', date)).rejects.toMatchObject({
      status: 500,
    });
  });
  it('keeps dashboard and patient history synchronized after booking and cancellation', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    const a = await s.booking.create(input);
    expect(
      (await s.dashboard(date)).appointmentPreview.some((x) => x.id === a.id),
    ).toBe(true);
    await s.booking.cancel(a.id);
    expect(
      (await s.appointments(input.patientId, { page: 1, size: 100 })).data.find(
        (x) => x.id === a.id,
      )?.displayStatus,
    ).toBe('CANCELLED');
  });
});

describe('예약 상태 및 조회 경계', () => {
  it('keeps raw booking status separate from the composite display filter', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    await s.booking.create(input);
    for (const status of [
      'BOOKED',
      'CANCELLED',
      'REGISTERED',
      'CALLED',
      'IN_PROGRESS',
      'COMPLETED',
    ] as const) {
      const result = await s.booking.list({ status }, { page: 1, size: 100 });
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data.every((x) => x.displayStatus === status)).toBe(true);
      if (status !== 'CANCELLED')
        expect(result.data.every((x) => x.status === 'BOOKED')).toBe(true);
    }
  });
  it('supports empty slots and aborts obsolete reads', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    s.development!.setScenario('empty');
    expect((await s.booking.slots('demo-doctor', date)).slots).toEqual([]);
    const controller = new AbortController();
    controller.abort();
    await expect(
      s.booking.list({}, { page: 1, size: 4 }, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('rejects exclusion of another doctor reservation and invalid patient/department relationships', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    const a = await s.booking.create(input);
    await expect(
      s.booking.slots('demo-doctor-2', date, a.id),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      s.booking.create({ ...input, departmentId: 'demo-pediatric' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
