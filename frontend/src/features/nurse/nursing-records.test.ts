import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { createMockStaffService } from '../../services/mock/staff';
import { mockAccounts } from '../../services/mock/auth';
import { apiClient } from '../../services/api/client';
import { apiNursingService } from './recordsService';
const page = { page: 1, size: 100 };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T03:00:00Z'));
});
afterEach(() => vi.useRealTimers());
async function setup() {
  const s = createMockStaffService({ latencyMs: 0 });
  const r = await s.intake.create({
    patientId: 'demo-patient-3',
    doctorId: 'demo-doctor-3',
    departmentId: 'demo-internal',
  });
  const n = s.nursing(async () => mockAccounts.NURSE);
  return { s, n, r };
}
it('creates server-authored v1 before care and returns the same record in list/detail', async () => {
  const { s, n, r } = await setup();
  const input = {
    content: '[가상] 상태 확인',
    author: mockAccounts.ADMIN,
    createdAt: '1900-01-01',
  };
  const a = await n.create(r.id, input);
  expect(a).toMatchObject({
    receptionId: r.id,
    author: { id: mockAccounts.NURSE.id },
    createdAt: '2026-11-09T12:00:00.000+09:00',
    latestVersion: { versionNo: 1, correctionReason: null, recordId: a.id },
  });
  expect((await n.list(r.id)).data[0]).toEqual(a);
  expect((await n.detail(a.id)).latestVersion).toEqual(a.latestVersion);
  expect((await s.intake.detail(r.id)).displayStatus).toBe('REGISTERED');
  // Returned objects cannot mutate the repository.
  a.latestVersion.content = 'external';
  expect((await n.detail(a.id)).latestVersion.content).toBe(input.content);
});
it.each(['', '  \n  '])(
  'rejects blank content %j without creating a record',
  async (content) => {
    const { n, r, s } = await setup();
    await expect(n.create(r.id, { content })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect((await n.list(r.id)).data).toEqual([]);
    await s.intake.remove(r.id);
  },
);
it('permits notes during and after care and preserves Visit identity', async () => {
  const { s, n, r } = await setup();
  const nurse = s.nurse(async () => mockAccounts.NURSE);
  await nurse.call(r.id);
  const visit = await nurse.enter(r.id);
  await n.create(r.id, { content: '[가상] 진료 중' });
  expect((await s.intake.detail(r.id)).visitId).toBe(visit.id);
  const completed = (
    await s.intake.list({ date: '2026-11-09' }, page)
  ).data.find((r) => r.displayStatus === 'COMPLETED')!;
  expect(completed).toBeTruthy();
  const a = await n.create(completed.id, { content: '[가상] 완료 후 관찰' });
  expect(a.receptionId).toBe(completed.id);
});
it('appends sequential versions and keeps original content, author and timestamp immutable', async () => {
  const { n, r } = await setup();
  const a = await n.create(r.id, { content: '[가상] 원본' });
  vi.setSystemTime(new Date('2026-11-09T03:02:00Z'));
  const v2 = await n.correct(a.id, {
    baseVersionNo: 1,
    content: '[가상] 보완',
    correctionReason: '관찰 추가',
  });
  const v3 = await n.correct(a.id, {
    baseVersionNo: 2,
    content: '[가상] 재보완',
    correctionReason: '오기 정정',
  });
  expect(v2).toMatchObject({ versionNo: 2, recordId: a.id });
  expect(v3.versionNo).toBe(3);
  expect(await n.version(a.id, 1)).toEqual(a.latestVersion);
  expect(await n.version(a.id, 2)).toEqual(v2);
  expect((await n.detail(a.id)).versions.map((v) => v.versionNo)).toEqual([
    1, 2, 3,
  ]);
});
it.each([
  { content: ' ', correctionReason: '사유' },
  { content: '내용', correctionReason: ' \n' },
])('requires correction content and reason', async (input) => {
  const { n, r } = await setup();
  const a = await n.create(r.id, { content: '[가상] 원본' });
  await expect(
    n.correct(a.id, { baseVersionNo: 1, ...input }),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect((await n.detail(a.id)).versions).toHaveLength(1);
});
it('allows another nurse to read but only the original author can correct', async () => {
  const { s, n, r } = await setup();
  const a = await n.create(r.id, { content: '[가상] 원본' });
  const other = s.nursing(async () => ({
    ...mockAccounts.NURSE,
    id: 'demo-second-nurse',
  }));
  expect((await other.detail(a.id)).id).toBe(a.id);
  await expect(
    other.correct(a.id, {
      baseVersionNo: 1,
      content: '다른 작성자',
      correctionReason: '사유',
    }),
  ).rejects.toMatchObject({ status: 403 });
});
it('rejects stale and concurrent base versions without overwriting the winning version', async () => {
  const { n, r } = await setup();
  const a = await n.create(r.id, { content: '[가상] 원본' });
  const results = await Promise.allSettled(
    ['A', 'B'].map((content) =>
      n.correct(a.id, { baseVersionNo: 1, content, correctionReason: '보완' }),
    ),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((r) => r.status === 'rejected')).toMatchObject({
    reason: { status: 409, code: 'VERSION_CONFLICT' },
  });
  expect((await n.detail(a.id)).versions).toHaveLength(2);
});
it('blocks other departments for every operation', async () => {
  const { s, n, r } = await setup();
  const a = await n.create(r.id, { content: '[가상] 내과' });
  const other = s.nursing(async () => ({
    ...mockAccounts.NURSE,
    department: {
      id: 'demo-pediatric',
      name: '소아청소년과',
      status: 'ACTIVE',
    },
  }));
  for (const action of [
    () => other.list(r.id),
    () => other.detail(a.id),
    () => other.version(a.id, 1),
    () => other.create(r.id, { content: '내용' }),
    () =>
      other.correct(a.id, {
        baseVersionNo: 1,
        content: '내용',
        correctionReason: '사유',
      }),
    () => other.history(r.patient.id, r.id),
  ])
    await expect(action()).rejects.toMatchObject({ status: 403 });
});
it.each(['STAFF', 'ADMIN'] as const)(
  'denies all note body access for %s',
  async (role) => {
    const { s, n, r } = await setup();
    const a = await n.create(r.id, { content: '[가상] 보호 본문' });
    const service = s.nursing(async () => mockAccounts[role]);
    for (const action of [
      () => service.list(r.id),
      () => service.detail(a.id),
      () => service.version(a.id, 1),
      () => service.history(r.patient.id, r.id),
      () => service.create(r.id, { content: '내용' }),
      () =>
        service.correct(a.id, {
          baseVersionNo: 1,
          content: '내용',
          correctionReason: '사유',
        }),
    ])
      await expect(action()).rejects.toMatchObject({ status: 403 });
    expect(JSON.stringify(await s.intake.detail(r.id))).not.toContain(
      '보호 본문',
    );
    expect(JSON.stringify(await s.dashboard())).not.toContain('보호 본문');
  },
);
it('allows the assigned doctor read interfaces only', async () => {
  const { s, n, r } = await setup();
  const a = await n.create(r.id, { content: '[가상] 관찰' });
  const doctor = s.nursing(async () => ({
    ...mockAccounts.DOCTOR,
    role: 'DOCTOR',
    doctorId: r.doctor.id,
  }));
  expect((await doctor.list(r.id)).data[0].id).toBe(a.id);
  expect((await doctor.detail(a.id)).latestVersion.content).toBe('[가상] 관찰');
  expect((await doctor.version(a.id, 1)).recordId).toBe(a.id);
  await expect(doctor.create(r.id, { content: '내용' })).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    doctor.correct(a.id, {
      baseVersionNo: 1,
      content: '내용',
      correctionReason: '사유',
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(doctor.history(r.patient.id, r.id)).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    s
      .nursing(async () => ({
        ...mockAccounts.DOCTOR,
        role: 'DOCTOR',
        doctorId: 'unassigned',
      }))
      .detail(a.id),
  ).rejects.toMatchObject({ status: 403 });
});
it('includes earlier and later receptions, excludes foreign departments, and prepends older cursor pages', async () => {
  const { s, n, r } = await setup();
  vi.setSystemTime(new Date('2026-11-08T03:00:00Z'));
  const old = await s.intake.create({
    patientId: r.patient.id,
    doctorId: r.doctor.id,
    departmentId: r.department.id,
  });
  const first = await n.create(old.id, { content: '[가상] 이전 날짜' });
  vi.setSystemTime(new Date('2026-11-09T03:00:00Z'));
  const middle = await n.create(r.id, { content: '[가상] 선택 접수' });
  const foreign = await s.intake.create({
    patientId: r.patient.id,
    doctorId: 'demo-doctor-2',
    departmentId: 'demo-pediatric',
  });
  const other = s.nursing(async () => ({
    ...mockAccounts.NURSE,
    department: { id: 'demo-pediatric', name: '가상과', status: 'ACTIVE' },
  }));
  await other.create(foreign.id, { content: '[가상] 제외할 다른 과' });
  vi.setSystemTime(new Date('2026-11-10T03:00:00Z'));
  const later = await s.intake.create({
    patientId: r.patient.id,
    doctorId: r.doctor.id,
    departmentId: r.department.id,
  });
  const last = await n.create(later.id, { content: '[가상] 이후 날짜' });
  const latest = await n.history(r.patient.id, r.id, { limit: 2 });
  const older = await n.history(r.patient.id, r.id, {
    limit: 2,
    before: latest.meta.nextBefore!,
  });
  expect([...older.data, ...latest.data].map((r) => r.id)).toEqual([
    first.id,
    middle.id,
    last.id,
  ]);
  expect(latest.data.every((r) => r.receivedAt)).toBe(true);
  expect(older.meta.hasMore).toBe(false);
  expect((await n.list(r.id)).data.map((r) => r.id)).toEqual([middle.id]);
  await expect(n.history('wrong-patient', r.id)).rejects.toMatchObject({
    status: 400,
  });
  await expect(
    n.history(r.patient.id, r.id, { before: 'bad' }),
  ).rejects.toMatchObject({ status: 400 });
});
it('blocks reception deletion after creation and correction without affecting other receptions', async () => {
  const { s, n, r } = await setup();
  const a = await n.create(r.id, { content: '[가상] 원본' });
  await expect(s.intake.remove(r.id)).rejects.toMatchObject({
    code: 'RECEPTION_HAS_NURSING_RECORDS',
  });
  await n.correct(a.id, {
    baseVersionNo: 1,
    content: '[가상] 정정',
    correctionReason: '보완',
  });
  await expect(s.intake.remove(r.id)).rejects.toMatchObject({
    code: 'RECEPTION_HAS_NURSING_RECORDS',
  });
  expect((await s.intake.detail(r.id)).id).toBe(r.id);
  const b = await s.intake.create({
    patientId: 'demo-patient-4',
    doctorId: r.doctor.id,
    departmentId: r.department.id,
  });
  await s.intake.remove(b.id);
  await expect(n.create(b.id, { content: '삭제 후' })).rejects.toMatchObject({
    status: 404,
  });
  expect((await n.detail(a.id)).versions).toHaveLength(2);
});
it('preserves appointment, patient and Visit links through a complete nurse note flow', async () => {
  const { s, n } = await setup();
  const p = await s.create({
    name: '가상기록환자',
    residentNumber: '900101-0000000',
    phone: '010-0000-1010',
  });
  const a = await s.booking.create({
    patientId: p.id,
    departmentId: 'demo-internal',
    doctorId: 'demo-doctor-3',
    startsAt: '2026-11-09T14:00:00+09:00',
  });
  const r = await s.intake.create({ appointmentId: a.id });
  const note = await n.create(r.id, { content: '[가상] 예약 접수 관찰' });
  const nurse = s.nurse(async () => mockAccounts.NURSE);
  await nurse.call(r.id);
  const visit = await nurse.enter(r.id);
  expect(await s.booking.detail(a.id)).toMatchObject({
    id: a.id,
    receptionId: r.id,
    patient: { id: p.id },
    displayStatus: 'IN_PROGRESS',
  });
  expect(await s.intake.detail(r.id)).toMatchObject({
    appointmentId: a.id,
    visitId: visit.id,
  });
  expect((await n.history(p.id, r.id)).data[0].id).toBe(note.id);
  await expect(s.intake.remove(r.id)).rejects.toMatchObject({
    code: 'RECEPTION_HAS_NURSING_RECORDS',
  });
});
it('simulates read/save failures and resets notes with the existing factory lifetime', async () => {
  const { s, n, r } = await setup();
  s.development!.setScenario('save-error');
  await expect(n.create(r.id, { content: '내용' })).rejects.toMatchObject({
    status: 500,
  });
  s.development!.setScenario('normal');
  expect((await n.list(r.id)).data).toEqual([]);
  await n.create(r.id, { content: '[가상] 일시 데이터' });
  s.development!.setScenario('error');
  await expect(n.detail('demo-nursing-1')).rejects.toMatchObject({
    status: 500,
  });
  const fresh = await setup();
  expect((await fresh.n.list(fresh.r.id)).data).toEqual([]);
});
it('rechecks session identity after asynchronous work, including same-department account changes', async () => {
  const { s, r } = await setup();
  let principal = structuredClone(mockAccounts.NURSE);
  let calls = 0;
  const n = s.nursing(async () => {
    if (++calls > 1) principal = { ...principal, id: 'different-nurse' };
    return principal;
  });
  await expect(n.create(r.id, { content: '세션 변경' })).rejects.toMatchObject({
    status: 403,
  });
});
it('implements all six exact HTTP paths/envelopes and excludes author/time from write payloads', async () => {
  const configs: InternalAxiosRequestConfig[] = [];
  const old = apiClient.defaults.adapter;
  apiClient.defaults.adapter = async (config) => {
    configs.push(config);
    return {
      data: {
        data: { id: 'result' },
        meta: { hasMore: false, nextBefore: null },
      },
      status: 200,
      statusText: 'OK',
      headers: new AxiosHeaders(),
      config,
    };
  };
  try {
    const abort = new AbortController();
    await apiNursingService.list(
      'r/a',
      { limit: 5, before: 'opaque' },
      abort.signal,
    );
    await apiNursingService.create('r/a', { content: '가상' });
    await apiNursingService.detail('n/a', abort.signal);
    await apiNursingService.version('n/a', 1, abort.signal);
    await apiNursingService.correct('n/a', {
      baseVersionNo: 1,
      content: '가상정정',
      correctionReason: '보완',
    });
    await apiNursingService.history(
      'p/a',
      'r/a',
      { limit: 5, before: 'cursor' },
      abort.signal,
    );
    expect(configs.map((c) => c.url)).toEqual([
      '/receptions/r%2Fa/nursing-records',
      '/receptions/r%2Fa/nursing-records',
      '/nursing-records/n%2Fa',
      '/nursing-records/n%2Fa/versions/1',
      '/nursing-records/n%2Fa/versions',
      '/patients/p%2Fa/nursing-records',
    ]);
    expect(JSON.parse(configs[1].data)).toEqual({ content: '가상' });
    expect(JSON.parse(configs[4].data)).toEqual({
      baseVersionNo: 1,
      content: '가상정정',
      correctionReason: '보완',
    });
    expect(configs[5].params).toEqual({
      limit: 5,
      before: 'cursor',
      receptionId: 'r/a',
    });
    expect(configs[0].signal).toBe(abort.signal);
  } finally {
    apiClient.defaults.adapter = old;
  }
});
