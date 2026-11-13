import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { apiClient } from '../../services/api/client';
import { createMockStaffService } from '../../services/mock/staff';
import { createMockReceptions } from '../../services/mock/receptions';
import { apiReceptions, type ReceptionInput } from './service';
import { businessDate } from '../staff/format';
const original = apiClient.defaults.adapter;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T00:00:00Z'));
});
afterEach(() => {
  apiClient.defaults.adapter = original;
  vi.useRealTimers();
});
const page = { page: 1, size: 100 };
const onsite = {
  patientId: 'demo-patient-3',
  departmentId: 'demo-internal',
  doctorId: 'demo-doctor',
};
async function booked(
  s = createMockStaffService({ latencyMs: 0 }),
  date = businessDate(),
) {
  return {
    s,
    a: await s.booking.create({
      ...onsite,
      startsAt: `${date}T11:00:00+09:00`,
    }),
  };
}
describe('REC_01~04 contracts and shared data', () => {
  it('uses exact oneOf payloads, filters, encoded IDs, cookies, AbortSignal and a bodyless DELETE', async () => {
    const requests: InternalAxiosRequestConfig[] = [];
    apiClient.defaults.adapter = async (config) => {
      requests.push(config);
      return {
        config,
        status: config.method === 'delete' ? 204 : 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        data: config.method === 'delete' ? undefined : { data: [], meta: null },
      };
    };
    const signal = new AbortController().signal;
    const filters = {
      date: '2026-11-09',
      name: '가상',
      birthDate: '1990-01-03',
      departmentId: 'dep',
      doctorId: 'doc',
      status: 'CALLED' as const,
    };
    await apiReceptions.list(filters, { page: 2, size: 5 }, signal);
    await apiReceptions.detail('opaque/id', signal);
    await apiReceptions.create({ appointmentId: 'apt' });
    await apiReceptions.create(onsite);
    expect(await apiReceptions.remove('opaque/id')).toBeUndefined();
    expect(requests.map((r) => [r.method, r.url])).toEqual([
      ['get', '/receptions'],
      ['get', '/receptions/opaque%2Fid'],
      ['post', '/receptions'],
      ['post', '/receptions'],
      ['delete', '/receptions/opaque%2Fid'],
    ]);
    expect(requests[0].params).toEqual({ ...filters, page: 2, size: 5 });
    expect(requests[0].signal).toBe(signal);
    expect(requests[1].signal).toBe(signal);
    expect(JSON.parse(requests[2].data)).toEqual({ appointmentId: 'apt' });
    expect(JSON.parse(requests[3].data)).toEqual(onsite);
    expect(requests[4].data).toBeUndefined();
    expect(requests.every((r) => r.withCredentials)).toBe(true);
  });
  it('links an appointment and updates all reads without copying/deleting the appointment', async () => {
    const { s, a } = await booked();
    vi.setSystemTime(new Date('2026-11-09T01:00:00Z'));
    const r = await s.intake.create({ appointmentId: a.id });
    expect(r.appointmentId).toBe(a.id);
    expect(await s.booking.detail(a.id)).toMatchObject({
      id: a.id,
      status: 'BOOKED',
      displayStatus: 'REGISTERED',
      receptionId: r.id,
    });
    expect(
      (await s.appointments(a.patient.id, page)).data.find((x) => x.id === a.id)
        ?.displayStatus,
    ).toBe('REGISTERED');
    expect(
      (await s.receptions(a.patient.id, page)).data.some((x) => x.id === r.id),
    ).toBe(true);
    expect(
      (await s.dashboard()).receptionPreview.some((x) => x.id === r.id),
    ).toBe(true);
    await expect(
      s.booking.reschedule(a.id, '2026-11-09T11:20:00+09:00'),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_ALREADY_RECEIVED' });
    await expect(s.booking.cancel(a.id)).rejects.toMatchObject({
      code: 'APPOINTMENT_ALREADY_RECEIVED',
    });
  });
  it('rejects future/previous date and cancelled appointment check-in', async () => {
    const { s, a } = await booked(undefined, '2026-11-10');
    await expect(
      s.intake.create({ appointmentId: a.id }),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_DATE_MISMATCH' });
    await s.booking.cancel(a.id);
    await expect(
      s.intake.create({ appointmentId: a.id }),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_CANCELLED' });
    vi.setSystemTime(new Date('2026-11-11T00:00:00Z'));
    const second = await booked(s, '2026-11-12');
    vi.setSystemTime(new Date('2026-11-13T00:00:00Z'));
    await expect(
      s.intake.create({ appointmentId: second.a.id }),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_DATE_MISMATCH' });
  });
  it('atomically rechecks same appointment and same-patient doctor duplicates in memory', async () => {
    const { s, a } = await booked();
    const results = await Promise.allSettled([
      s.intake.create({ appointmentId: a.id }),
      s.intake.create({ appointmentId: a.id }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (results.find((r) => r.status === 'rejected') as PromiseRejectedResult)
        .reason.code,
    ).toBe('DUPLICATE_ACTIVE_RECEPTION');
    await expect(s.intake.create(onsite)).rejects.toMatchObject({
      code: 'DUPLICATE_ACTIVE_RECEPTION',
    });
  });
  it('registers walk-ins including newly registered patients and does not create appointments', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    const patient = await s.create({
      name: '가상현장신규',
      residentNumber: '900101-0000000',
      phone: '010-0000-1111',
    });
    const r = await s.intake.create({ ...onsite, patientId: patient.id });
    expect(r.appointmentId).toBeNull();
    expect((await s.appointments(patient.id, page)).data).toEqual([]);
    await s.update(patient.id, { name: '가상현장수정' });
    expect((await s.intake.detail(r.id)).patient.name).toBe('가상현장수정');
  });
  it('allows another doctor while rejecting mismatched department and mixed/extra input fields', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    await s.intake.create(onsite);
    await expect(
      s.intake.create({
        ...onsite,
        departmentId: 'demo-pediatric',
        doctorId: 'demo-doctor-2',
      }),
    ).resolves.toMatchObject({ status: 'REGISTERED' });
    await expect(
      s.intake.create({ ...onsite, departmentId: 'demo-pediatric' }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      s.intake.create({
        ...onsite,
        appointmentId: 'bad',
      } as unknown as ReceptionInput),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('deletes intake only, preserves occupied booking slot and enables same-day recheck-in', async () => {
    const { s, a } = await booked();
    const r = await s.intake.create({ appointmentId: a.id });
    await s.intake.remove(r.id);
    expect(await s.booking.detail(a.id)).toMatchObject({
      id: a.id,
      receptionId: null,
      displayStatus: 'BOOKED',
      status: 'BOOKED',
    });
    expect(
      (await s.receptions(a.patient.id, page)).data.some((x) => x.id === r.id),
    ).toBe(false);
    expect(
      (await s.booking.slots(a.doctor.id, '2026-11-09')).slots.find(
        (x) => x.startsAt === a.startsAt,
      )?.available,
    ).toBe(false);
    const next = await s.intake.create({ appointmentId: a.id });
    expect(next.id).not.toBe(r.id);
    expect((await s.booking.detail(a.id)).receptionId).toBe(next.id);
    await expect(s.intake.remove(r.id)).rejects.toMatchObject({ status: 404 });
  });
  it('restricts nursing and started visits, while called intake without notes can be removed and its call released', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    await expect(
      s.intake.remove('demo-reception-demo-patient-1'),
    ).rejects.toMatchObject({ code: 'RECEPTION_HAS_NURSING_RECORDS' });
    await expect(
      s.intake.remove('demo-reception-demo-patient-2-2'),
    ).rejects.toMatchObject({ code: 'VISIT_ALREADY_STARTED' });
    const id = 'demo-reception-demo-patient-2-1';
    expect((await s.intake.detail(id)).status).toBe('CALLED');
    await s.intake.remove(id);
    expect(
      (await s.booking.detail('demo-appointment-demo-patient-2-1'))
        .displayStatus,
    ).toBe('BOOKED');
    await expect(s.intake.detail(id)).rejects.toMatchObject({ status: 404 });
    await s.intake.remove('demo-walkin-demo-patient');
    expect(
      (
        await s.intake.list({ date: businessDate(), status: 'CALLED' }, page)
      ).data.some((r) => r.id === 'demo-walkin-demo-patient'),
    ).toBe(false);
  });
  it('applies date/name/birthdate/department/doctor/status AND filters and response pagination', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    const filters = {
      date: businessDate(),
      name: '가상환자001',
      birthDate: '1985-03-14',
      departmentId: 'demo-internal',
      doctorId: 'demo-doctor',
      status: 'REGISTERED' as const,
    };
    const result = await s.intake.list(filters, { page: 1, size: 1 });
    expect(result.meta.totalItems).toBe(2);
    expect(result.meta.totalPages).toBe(2);
    expect(result.data[0].displayStatus).toBe('REGISTERED');
    expect(
      (await s.intake.list(filters, { page: 2, size: 1 })).data[0].id,
    ).not.toBe(result.data[0].id);
    expect(
      (await s.intake.list({ ...filters, birthDate: '2000-01-01' }, page)).data,
    ).toEqual([]);
    expect(
      (await s.intake.list({ date: '2025-01-02' }, page)).meta.totalItems,
    ).toBe(2);
    await expect(s.intake.list({ date: '' }, page)).rejects.toMatchObject({
      status: 400,
    });
  });
  it('fails without writes, supports empty/aborted reads and resets with factory lifetime', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    s.development!.setScenario('save-error');
    await expect(s.intake.create(onsite)).rejects.toMatchObject({
      status: 500,
    });
    s.development!.setScenario('normal');
    const r = await s.intake.create(onsite);
    s.development!.setScenario('save-error');
    await expect(s.intake.remove(r.id)).rejects.toMatchObject({ status: 500 });
    s.development!.setScenario('normal');
    expect((await s.intake.detail(r.id)).status).toBe('REGISTERED');
    await expect(
      createMockStaffService({ latencyMs: 0 }).intake.detail(r.id),
    ).rejects.toMatchObject({ status: 404 });
    s.development!.setScenario('empty');
    expect((await s.intake.list({ date: businessDate() }, page)).data).toEqual(
      [],
    );
    s.development!.setScenario('error');
    await expect(
      s.intake.list({ date: businessDate() }, page),
    ).rejects.toMatchObject({ status: 500 });
    const controller = new AbortController();
    controller.abort();
    await expect(
      s.intake.detail(r.id, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('permits a new reception after completed care without changing any clinical records', async () => {
    const s = createMockStaffService({ latencyMs: 0 });
    const patient = await s.detail('demo-patient');
    const doctor = (await s.booking.doctors('demo-internal'))[0];
    const done = {
      id: 'finished',
      patient,
      department: doctor.department,
      doctor,
      startsAt: '2026-11-09T09:00:00+09:00',
      status: 'BOOKED' as const,
      displayStatus: 'COMPLETED' as const,
      registeredBy: (await s.booking.detail('demo-appointment-demo-patient-0'))
        .registeredBy,
      receptionId: 'finished-reception',
    };
    const intake = createMockReceptions({
      patients: () => [patient],
      seedWalkIns: false,
      appointments: [done],
      doctors: [doctor],
      wait: async () => {},
      page: (data, input) => ({
        data,
        meta: { ...input, totalItems: data.length, totalPages: 1 },
      }),
    });
    const added = await intake.create({
      patientId: patient.id,
      departmentId: doctor.department.id,
      doctorId: doctor.id,
    });
    expect(added.id).not.toBe(done.receptionId);
    expect((await intake.detail('finished-reception')).visitStatus).toBe(
      'COMPLETED',
    );
  });
});
