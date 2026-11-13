import { afterEach, describe, expect, it } from 'vitest';
import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { apiClient } from '../../services/api/client';
import { createMockStaffService } from '../../services/mock/staff';
import { apiStaffService } from './apiStaffService';
import { businessDate } from './format';

const originalAdapter = apiClient.defaults.adapter;
afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
});

describe('PAT_01~07 and DASH_01 API contracts', () => {
  it('requests list, detail, paginated histories and dashboard with exact paths and cancellation', async () => {
    const requests: InternalAxiosRequestConfig[] = [];
    apiClient.defaults.adapter = async (config) => {
      requests.push(config);
      return {
        config,
        status: 200,
        statusText: 'OK',
        data: {
          data: [],
          meta: { page: 2, size: 5, totalItems: 0, totalPages: 0 },
        },
        headers: new AxiosHeaders(),
      };
    };
    const signal = new AbortController().signal;
    const filters = {
      name: '가상환자',
      patientNumber: 'P0001042',
      birthDate: '1985-03-14',
      phone: '010-0000-0001',
    };
    await apiStaffService.list(filters, { page: 2, size: 5 }, signal);
    await apiStaffService.detail('opaque/id', signal);
    await apiStaffService.appointments(
      'opaque/id',
      { page: 2, size: 5 },
      signal,
    );
    await apiStaffService.receptions('opaque/id', { page: 2, size: 5 }, signal);
    await apiStaffService.visits('opaque/id', { page: 2, size: 5 }, signal);
    await apiStaffService.dashboard('2026-11-12', signal);
    expect(requests.map((request) => request.url)).toEqual([
      '/patients',
      '/patients/opaque%2Fid',
      '/patients/opaque%2Fid/appointments',
      '/patients/opaque%2Fid/receptions',
      '/patients/opaque%2Fid/visits',
      '/dashboards/staff',
    ]);
    expect(requests[0].params).toEqual({ ...filters, page: 2, size: 5 });
    expect(requests[2].params).toEqual({ page: 2, size: 5 });
    expect(requests[5].params).toEqual({ date: '2026-11-12' });
    for (const request of requests) {
      expect(request.method).toBe('get');
      expect(request.withCredentials).toBe(true);
      expect(request.signal).toBe(signal);
    }
  });
  it('posts only declared registration fields and omits unchanged identity on patch', async () => {
    const requests: InternalAxiosRequestConfig[] = [];
    apiClient.defaults.adapter = async (config) => {
      requests.push(config);
      return {
        config,
        status: config.method === 'post' ? 201 : 200,
        statusText: 'OK',
        data: { data: { id: 'demo' }, meta: null },
        headers: new AxiosHeaders(),
      };
    };
    const input = {
      name: '가상환자',
      residentNumber: '900101-0000000',
      phone: '010-0000-9999',
    };
    await apiStaffService.create(input);
    await apiStaffService.update('demo', { phone: '010-0000-8888' });
    expect(requests[0].url).toBe('/patients');
    expect(requests[0].method).toBe('post');
    expect(JSON.parse(requests[0].data)).toEqual(input);
    expect(requests[1].url).toBe('/patients/demo');
    expect(requests[1].method).toBe('patch');
    expect(JSON.parse(requests[1].data)).toEqual({ phone: '010-0000-8888' });
    expect(requests[0].url).not.toContain('900101');
  });
});

describe('central in-memory synthetic staff store', () => {
  it('shares actual mutations across list, detail, histories and dashboard without retaining raw identities', async () => {
    const service = createMockStaffService({ latencyMs: 0 });
    const patient = await service.create({
      name: '가상새환자',
      residentNumber: '900101-0000000',
      phone: '010-0000-9999',
    });
    expect(patient.birthDate).toBe('1990-01-01');
    expect(patient.maskedResidentNumber).toBe('900101-•••••••');
    expect(JSON.stringify(patient)).not.toContain('900101-0000000');
    await service.update(patient.id, { name: '가상수정환자' });
    expect((await service.detail(patient.id)).name).toBe('가상수정환자');
    expect(
      (await service.list({ name: '가상수정환자' }, { page: 1, size: 5 })).meta
        .totalItems,
    ).toBe(1);
    expect(
      (await service.appointments(patient.id, { page: 1, size: 5 })).data,
    ).toEqual([]);
    expect(
      (await service.receptions(patient.id, { page: 1, size: 5 })).data,
    ).toEqual([]);
    await service.update('demo-patient', { name: '가상수정기존환자' });
    expect((await service.dashboard()).appointmentPreview[0].patient.name).toBe(
      '가상수정기존환자',
    );
    expect(
      (await service.visits(patient.id, { page: 1, size: 5 })).data,
    ).toEqual([]);
    const visits = await service.visits('demo-patient', { page: 1, size: 5 });
    expect(Object.keys(visits.data[0]).sort()).toEqual([
      'completedAt',
      'department',
      'displayStatus',
      'doctor',
      'patientId',
      'visitId',
    ]);
  });
  it('does not expose masked identity in list rows, and reset/reload creates a fresh store', async () => {
    const service = createMockStaffService({ latencyMs: 0 });
    const list = await service.list({}, { page: 1, size: 5 });
    expect(Object.keys(list.data[0]).sort()).toEqual([
      'birthDate',
      'id',
      'name',
      'patientNumber',
      'phone',
    ]);
    await service.update('demo-patient', { name: '가상변경값' });
    const fresh = createMockStaffService({ latencyMs: 0 });
    expect((await fresh.detail('demo-patient')).name).toBe('가상환자001');
  });
  it('returns independent snapshots and chronological recent reception previews', async () => {
    const service = createMockStaffService({ latencyMs: 0 });
    const snapshot = await service.detail('demo-patient');
    snapshot.name = '버릴가상값';
    expect((await service.detail('demo-patient')).name).toBe('가상환자001');
    const dashboard = await service.dashboard();
    expect(dashboard.date).toBe(businessDate());
    const times = dashboard.receptionPreview.map((row) => row.receivedAt);
    expect(times).toEqual([...times].sort().reverse());
  });
  it('simulates empty, read error and write error without applying a failed mutation', async () => {
    const service = createMockStaffService({ latencyMs: 0 });
    service.development!.setScenario('empty');
    expect((await service.list({}, { page: 1, size: 5 })).data).toEqual([]);
    service.development!.setScenario('error');
    await expect(service.detail('demo-patient')).rejects.toMatchObject({
      status: 500,
    });
    service.development!.setScenario('save-error');
    await expect(
      service.update('demo-patient', { name: '실패값' }),
    ).rejects.toMatchObject({ status: 500 });
    service.development!.setScenario('normal');
    expect((await service.detail('demo-patient')).name).toBe('가상환자001');
  });
  it('rejects masked or non-synthetic registration numbers without creating a patient', async () => {
    const service = createMockStaffService({ latencyMs: 0 });
    for (const residentNumber of [
      '900101-•••••••',
      '900101-1234567',
      '990231-0000000',
    ])
      await expect(
        service.create({
          name: '가상환자',
          residentNumber,
          phone: '010-0000-9999',
        }),
      ).rejects.toMatchObject({ status: 400 });
    expect((await service.list({}, { page: 1, size: 5 })).meta.totalItems).toBe(
      25,
    );
  });
  it('cancels a slow read when its consumer leaves', async () => {
    const service = createMockStaffService({ latencyMs: 100 });
    const controller = new AbortController();
    const request = service.list({}, { page: 1, size: 5 }, controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});
