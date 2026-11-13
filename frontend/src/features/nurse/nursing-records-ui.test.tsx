import { StrictMode } from 'react';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRoutes } from '../../app/router/routes';
import { createQueryClient } from '../../app/providers/queryClient';
import { createMockStaffService } from '../../services/mock/staff';
import { createMockAuthService, mockAccounts } from '../../services/mock/auth';
import { recordKey, useRecordWrite } from './recordQueries';
import { queryKeys } from '../../services/api/queryKeys';
import type { SelfAccount } from '../../types/auth';
vi.mock('../../services/mode', () => ({ apiMode: 'mock' }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T03:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function fixture() {
  const s = createMockStaffService({ latencyMs: 0 });
  const r = await s.intake.create({
    patientId: 'demo-patient-3',
    doctorId: 'demo-doctor-3',
    departmentId: 'demo-internal',
  });
  const n = s.nursing(async () => mockAccounts.NURSE);
  return { s, r, n };
}
async function start(
  s: ReturnType<typeof createMockStaffService>,
  path: string,
  account?: SelfAccount,
) {
  const auth = createMockAuthService({ latencyMs: 0 });
  await auth.login({ identifier: 'nurse', password: '1234' });
  if (account) auth.me = async () => account;
  const client = createQueryClient();
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <AppProviders service={auth} client={client}>
          <AppRoutes staffService={s} />
        </AppProviders>
      </MemoryRouter>
    </StrictMode>,
  );
  return { auth, client };
}
const input = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
it('renders the existing nurse shell, validates content, saves once, and refreshes list/detail', async () => {
  const { s, r, n } = await fixture();
  let count = 0;
  const factory = s.nursing.bind(s);
  s.nursing = (p) => {
    const service = factory(p);
    const create = service.create;
    return {
      ...service,
      create: (...args) => {
        count++;
        return create(...args);
      },
    };
  };
  const { client } = await start(s, `/nurse/receptions/${r.id}/records`);
  await screen.findByRole('heading', { name: '간호 기록 작성' });
  await screen.findByText('등록된 간호 기록이 없습니다.');
  expect(screen.getByText('숭실대 병원')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '기록 저장' }));
  await screen.findByText('기록 내용을 입력해 주세요.');
  expect(count).toBe(0);
  input('기록 내용', '[가상] 새 기록');
  const submit = screen.getByRole('button', { name: '기록 저장' });
  fireEvent.click(submit);
  fireEvent.click(submit);
  await screen.findByText('간호 기록이 저장되었습니다.');
  expect(count).toBe(1);
  expect((await n.list(r.id)).data).toHaveLength(1);
  expect(
    within(
      await screen.findByRole('region', { name: '간호 기록 본문' }),
    ).getByText('[가상] 새 기록'),
  ).toBeTruthy();
  expect(screen.getByText('최신 버전 1')).toBeTruthy();
  expect(client.getMutationCache().getAll()).toEqual([]);
});
it('requires reason, appends a correction, reads original independently, and cancels back to detail', async () => {
  const { s, n, r } = await fixture();
  const a = await n.create(r.id, { content: '[가상] 원본' });
  await start(s, `/nurse/records/${a.id}/correct?receptionId=${r.id}`);
  await screen.findByRole('heading', { name: '간호 기록 정정' });
  input('기록 내용', '[가상] 보완 내용');
  fireEvent.click(screen.getByRole('button', { name: '정정 기록 저장' }));
  await screen.findByText('정정 사유를 입력해 주세요.');
  input('정정 사유', '관찰 내용 추가');
  fireEvent.click(screen.getByRole('button', { name: '정정 기록 저장' }));
  await screen.findByText('정정 기록이 저장되었습니다.');
  const panel = await screen.findByRole('region', { name: '간호 기록 본문' });
  fireEvent.click(within(panel).getByRole('button', { name: /원본/ }));
  await within(panel).findByText('[가상] 원본');
  expect(within(panel).queryByText('관찰 내용 추가')).toBeNull();
  fireEvent.click(within(panel).getByRole('button', { name: /1차 정정/ }));
  await within(panel).findByText('관찰 내용 추가');
  fireEvent.click(
    within(panel).getByRole('link', { name: '정정 기록 추가 ›' }),
  );
  await screen.findByRole('heading', { name: '간호 기록 정정' });
  fireEvent.click(screen.getByRole('link', { name: '취소' }));
  await screen.findByRole('navigation', { name: '기록 버전' });
  expect((await n.detail(a.id)).versions).toHaveLength(2);
});
it('keeps the correction draft on VERSION_CONFLICT and requires explicit latest reload before retry', async () => {
  const { s, n, r } = await fixture();
  const a = await n.create(r.id, { content: '[가상] 원본' });
  const factory = s.nursing.bind(s);
  let first = true;
  s.nursing = (p) => {
    const service = factory(p);
    return {
      ...service,
      async correct(id, data) {
        if (first) {
          first = false;
          await n.correct(id, {
            baseVersionNo: 1,
            content: '[가상] 다른 창 최신 내용',
            correctionReason: '먼저 저장',
          });
        }
        return service.correct(id, data);
      },
    };
  };
  await start(s, `/nurse/records/${a.id}/correct`);
  await screen.findByRole('heading', { name: '간호 기록 정정' });
  input('기록 내용', '[가상] 내 초안 유지');
  input('정정 사유', '내 사유 유지');
  fireEvent.click(screen.getByRole('button', { name: '정정 기록 저장' }));
  await screen.findByText(/다른 정정이 저장되었습니다/);
  expect(
    (screen.getByLabelText('기록 내용') as HTMLTextAreaElement).value,
  ).toBe('[가상] 내 초안 유지');
  expect((screen.getByLabelText('정정 사유') as HTMLInputElement).value).toBe(
    '내 사유 유지',
  );
  expect(
    screen
      .getByRole('button', { name: '정정 기록 저장' })
      .hasAttribute('disabled'),
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '최신 기록 다시 조회' }));
  await screen.findByText('확인한 최신 버전: 2');
  expect(screen.getByText('[가상] 다른 창 최신 내용')).toBeTruthy();
  expect(
    (screen.getByLabelText('기록 내용') as HTMLTextAreaElement).value,
  ).toBe('[가상] 내 초안 유지');
  fireEvent.click(screen.getByRole('button', { name: '정정 기록 저장' }));
  await screen.findByText('정정 기록이 저장되었습니다.');
  expect((await n.detail(a.id)).latestVersion).toMatchObject({
    versionNo: 3,
    content: '[가상] 내 초안 유지',
    correctionReason: '내 사유 유지',
  });
});
it('makes another author read-only and blocks direct correction routes', async () => {
  const { s, n, r } = await fixture();
  const a = await n.create(r.id, { content: '[가상] 다른 작성자' });
  const account = { ...mockAccounts.NURSE, id: 'second-nurse' };
  await start(s, `/nurse/records/${a.id}`, account);
  await screen.findByRole('navigation', { name: '기록 버전' });
  expect(screen.queryByRole('link', { name: '정정 기록 추가 ›' })).toBeNull();
});
it('blocks direct correction even for another nurse in the same department', async () => {
  const { s, n, r } = await fixture();
  const a = await n.create(r.id, { content: '[가상] 다른 작성자' });
  await start(s, `/nurse/records/${a.id}/correct`, {
    ...mockAccounts.NURSE,
    id: 'second-nurse',
  });
  await screen.findByText('최초 작성자만 정정할 수 있습니다.');
  expect(screen.queryByLabelText('기록 내용')).toBeNull();
});
it('distinguishes patient history/current reception and writes a new record to the selected reception', async () => {
  const { s, n, r } = await fixture();
  vi.setSystemTime(new Date('2026-11-08T03:00:00Z'));
  const old = await s.intake.create({
    patientId: r.patient.id,
    doctorId: r.doctor.id,
    departmentId: r.department.id,
  });
  const older = await n.create(old.id, { content: '[가상] 다른 접수 내용' });
  for (let i = 0; i < 6; i++)
    await n.create(old.id, { content: `[가상] 다른 접수 ${i}` });
  vi.setSystemTime(new Date('2026-11-09T03:00:00Z'));
  await start(s, `/nurse/receptions/${r.id}/records`);
  await screen.findByRole('button', { name: '이전 기록 더 보기' });
  fireEvent.click(screen.getByRole('button', { name: '이전 기록 더 보기' }));
  await screen.findByText('[가상] 다른 접수 내용');
  fireEvent.click(screen.getByRole('button', { name: '현재 접수 기록' }));
  await screen.findByText('등록된 간호 기록이 없습니다.');
  fireEvent.click(screen.getByRole('button', { name: '환자 전체 이력' }));
  fireEvent.click(
    await screen.findByRole('button', { name: '이전 기록 더 보기' }),
  );
  await screen.findByText('[가상] 다른 접수 내용');
  const article = screen.getByText('[가상] 다른 접수 내용').closest('article')!;
  fireEvent.click(within(article).getByRole('link', { name: '기록 보기 ›' }));
  await screen.findByRole('navigation', { name: '기록 버전' });
  expect(screen.getByText(/다른 접수의 기록/)).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: '새 기록 작성' }));
  await screen.findByRole('heading', { name: '간호 기록 작성' });
  input('기록 내용', '[가상] 현재 접수에 저장');
  fireEvent.click(screen.getByRole('button', { name: '기록 저장' }));
  await screen.findByText('간호 기록이 저장되었습니다.');
  expect((await n.list(r.id)).data[0].latestVersion.content).toBe(
    '[가상] 현재 접수에 저장',
  );
  expect((await n.detail(older.id)).receptionId).toBe(old.id);
});
it('preserves unsaved input on server error and supports retry without duplicate records', async () => {
  const { s, r, n } = await fixture();
  await start(s, `/nurse/receptions/${r.id}/records`);
  await screen.findByRole('heading', { name: '간호 기록 작성' });
  s.development!.setScenario('save-error');
  input('기록 내용', '[가상] 재시도 초안');
  fireEvent.click(screen.getByRole('button', { name: '기록 저장' }));
  await screen.findByRole('alert');
  expect(
    (screen.getByLabelText('기록 내용') as HTMLTextAreaElement).value,
  ).toBe('[가상] 재시도 초안');
  s.development!.setScenario('normal');
  fireEvent.click(screen.getByRole('button', { name: '기록 저장' }));
  await screen.findByText('간호 기록이 저장되었습니다.');
  expect((await n.list(r.id)).data).toHaveLength(1);
});
it('clears private note cache and rejects a pending mock write after logout', async () => {
  const { s, r, n } = await fixture();
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const factory = s.nursing.bind(s);
  s.nursing = (p) => {
    const service = factory(p);
    return {
      ...service,
      async create(id, data) {
        await delayed;
        return service.create(id, data);
      },
    };
  };
  const { client } = await start(s, `/nurse/receptions/${r.id}/records`);
  await screen.findByRole('heading', { name: '간호 기록 작성' });
  input('기록 내용', '[가상] 로그아웃 후 저장 금지');
  fireEvent.click(screen.getByRole('button', { name: '기록 저장' }));
  await screen.findByRole('button', { name: '저장 중…' });
  fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
  await screen.findByRole('heading', { name: '로그인' });
  await act(async () => {
    release();
    await delayed;
  });
  expect((await n.list(r.id)).data).toEqual([]);
  expect(client.getQueryCache().getAll()).toEqual([]);
});
it('invalidates all account/department record projections and reception eligibility, without mutation payload retention', async () => {
  const { r, n } = await fixture();
  const auth = createMockAuthService({ latencyMs: 0 });
  await auth.login({ identifier: 'nurse', password: '1234' });
  const client = createQueryClient();
  const key = recordKey(mockAccounts.NURSE.id, 'demo-internal');
  const keys = [
    ['list', r.id],
    ['detail', 'demo-nursing-1'],
    ['version', 'demo-nursing-1', 1],
    ['history', r.patient.id],
  ].map((parts) => [...key, ...parts]);
  keys.forEach((k) => client.setQueryData(k, 'stale'));
  const intakeKey = [
    ...queryKeys.resource(mockAccounts.NURSE.id, 'staff-receptions'),
    'detail',
    r.id,
  ];
  client.setQueryData(intakeKey, 'stale');
  const hook = renderHook(
    () => {
      const ready = useQuery({
        queryKey: ['ready'],
        queryFn: async () => true,
      });
      return { write: useRecordWrite(), ready };
    },
    {
      wrapper: ({ children }) => (
        <AppProviders service={auth} client={client}>
          {children}
        </AppProviders>
      ),
    },
  );
  await waitFor(() => expect(hook.result.current.ready.data).toBe(true));
  // Auth restoration intentionally clears every old account cache; seed after restoration.
  keys.forEach((k) => client.setQueryData(k, 'stale'));
  client.setQueryData(intakeKey, 'stale');
  await act(async () => {
    await hook.result.current.write.run(
      () => n.create(r.id, { content: '[가상] 캐시 갱신' }),
      () => undefined,
    );
  });
  [...keys, intakeKey].forEach((k) =>
    expect(client.getQueryState(k)?.isInvalidated).toBe(true),
  );
  expect(client.getMutationCache().getAll()).toEqual([]);
});
