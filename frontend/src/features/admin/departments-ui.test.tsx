import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  act,
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { createMockStaffService } from '../../services/mock/staff';
import { createMockAccountStore } from '../../services/mock/accounts';
import { createMockAuthService, mockAccounts } from '../../services/mock/auth';
import { AppProviders } from '../../app/providers/AppProviders';
import { createQueryClient } from '../../app/providers/queryClient';
import { AppRoutes } from '../../app/router/routes';
import { queryKeys } from '../../services/api/queryKeys';
import type { Role, SelfAccount } from '../../types/auth';

vi.mock('../../services/mode', () => ({ apiMode: 'mock' }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T03:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function setup(
  path = '/admin/departments',
  extra: SelfAccount[] = [],
  role: Role | null = 'ADMIN',
) {
  const accounts = createMockAccountStore([
    ...Object.values(mockAccounts),
    ...extra,
  ]);
  const s = createMockStaffService({ latencyMs: 0, accounts });
  const auth = createMockAuthService({ latencyMs: 0, accounts });
  if (role)
    await auth.login({ identifier: role.toLowerCase(), password: '1234' });
  const client = createQueryClient();
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders service={auth} client={client}>
        <AppRoutes staffService={s} />
      </AppProviders>
    </MemoryRouter>,
  );
  return { s, auth, accounts, client, ...result };
}
async function create(name: string) {
  fireEvent.click(await screen.findByRole('button', { name: '진료과 등록' }));
  let dialog = await screen.findByRole('dialog', { name: '진료과 등록' });
  fireEvent.change(within(dialog).getByLabelText('진료과명'), {
    target: { value: name },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
  dialog = await screen.findByRole('dialog', { name: '등록할까요?' });
  fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  return screen.getByRole('region', { name: '선택 진료과' });
}
it('renders Figma two-column list and medical staff, filters department status and handles an empty selection', async () => {
  await setup();
  await screen.findByRole('table', { name: '소속 의료진' });
  expect(
    screen
      .getByRole('button', { name: '내과 활성' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
  expect(
    screen.getByRole('button', {
      name: `${mockAccounts.NURSE.name} 소속 변경`,
    }),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText('진료과 상태'), {
    target: { value: 'INACTIVE' },
  });
  await screen.findByText('조건에 맞는 진료과가 없습니다.');
  expect(screen.queryByRole('region', { name: '선택 진료과' })).toBeNull();
  fireEvent.change(screen.getByLabelText('진료과 상태'), {
    target: { value: '' },
  });
  await screen.findByRole('table', { name: '소속 의료진' });
});
it('creates after validation/confirmation, updates dashboard and makes the department available in account invitations', async () => {
  const { s, client } = await setup('/admin');
  await screen.findByRole('region', { name: '진료과 현황' });
  fireEvent.click(
    within(screen.getByRole('navigation', { name: '주 메뉴' })).getByRole(
      'link',
      { name: '진료과·의료진' },
    ),
  );
  fireEvent.click(await screen.findByRole('button', { name: '진료과 등록' }));
  const form = await screen.findByRole('dialog', { name: '진료과 등록' });
  fireEvent.click(within(form).getByRole('button', { name: '등록' }));
  expect(within(form).getByText('진료과명을 입력해 주세요.')).toBeTruthy();
  fireEvent.click(within(form).getByRole('button', { name: '취소' }));
  await create('가상통합검사과');
  expect(
    (await s.booking.departments()).some((d) => d.name === '가상통합검사과'),
  ).toBe(true);
  expect(
    client.getQueryState([
      ...queryKeys.resource(mockAccounts.ADMIN.id, 'admin'),
      'dashboard',
    ])?.isInvalidated,
  ).toBe(true);
  fireEvent.click(
    within(screen.getByRole('navigation', { name: '주 메뉴' })).getByRole(
      'link',
      { name: '계정 관리' },
    ),
  );
  fireEvent.click(await screen.findByRole('button', { name: '계정 초대' }));
  const invite = await screen.findByRole('dialog', { name: '계정 초대' });
  fireEvent.change(within(invite).getByLabelText('역할'), {
    target: { value: 'DOCTOR' },
  });
  await within(invite).findByRole('option', { name: '가상통합검사과' });
});
it('keeps names and list unchanged on duplicates/server failures, permits retry, and suppresses rapid double save', async () => {
  const { s } = await setup();
  fireEvent.click(await screen.findByRole('button', { name: '진료과 등록' }));
  let dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('진료과명'), {
    target: { value: '내과' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
  dialog = await screen.findByRole('dialog', { name: '등록할까요?' });
  fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
  await within(dialog).findByRole('alert');
  fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
  dialog = await screen.findByRole('dialog', { name: '진료과 등록' });
  expect(
    (within(dialog).getByLabelText('진료과명') as HTMLInputElement).value,
  ).toBe('내과');
  fireEvent.change(within(dialog).getByLabelText('진료과명'), {
    target: { value: '가상재시도과' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
  dialog = await screen.findByRole('dialog', { name: '등록할까요?' });
  s.development!.setScenario('save-error');
  fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
  await within(dialog).findByRole('alert');
  s.development!.setScenario('normal');
  const b = within(dialog).getByRole('button', { name: '등록' });
  fireEvent.click(b);
  fireEvent.click(b);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    (await s.departments(async () => mockAccounts.ADMIN).list()).filter(
      (d) => d.name === '가상재시도과',
    ),
  ).toHaveLength(1);
});
it('renames a department with existing value, supports cancel, and updates the selected heading', async () => {
  const { s } = await setup();
  const detail = await screen.findByRole('region', { name: '선택 진료과' });
  fireEvent.click(within(detail).getByRole('button', { name: '수정' }));
  let dialog = await screen.findByRole('dialog', { name: '진료과 수정' });
  expect(
    (within(dialog).getByLabelText('진료과명') as HTMLInputElement).value,
  ).toBe('내과');
  fireEvent.change(within(dialog).getByLabelText('진료과명'), {
    target: { value: '가상내과 변경' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
  dialog = await screen.findByRole('dialog', { name: '저장할까요?' });
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
  await screen.findByRole('heading', { name: '가상내과 변경' });
  expect(
    (
      await s
        .admin(async () => mockAccounts.ADMIN)
        .detail(mockAccounts.NURSE.id)
    ).department?.name,
  ).toBe('가상내과 변경');
});
it('deactivates/reactivates an empty department with confirmation and deletes it without leaving a stale selection', async () => {
  const { s } = await setup();
  let detail = await create('가상삭제가능과');
  fireEvent.click(within(detail).getByRole('button', { name: '비활성화' }));
  let dialog = await screen.findByRole('dialog', {
    name: '진료과 상태를 변경할까요?',
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '비활성화' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  detail = screen.getByRole('region', { name: '선택 진료과' });
  expect(within(detail).getByText('비활성')).toBeTruthy();
  fireEvent.click(within(detail).getByRole('button', { name: '활성화' }));
  dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: '활성화' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  detail = screen.getByRole('region', { name: '선택 진료과' });
  fireEvent.click(within(detail).getByRole('button', { name: '삭제' }));
  dialog = await screen.findByRole('dialog', { name: '진료과를 삭제할까요?' });
  fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.queryByRole('heading', { name: '가상삭제가능과' })).toBeNull();
  expect(
    (await s.departments(async () => mockAccounts.ADMIN).list()).some(
      (d) => d.name === '가상삭제가능과',
    ),
  ).toBe(false);
});
it.each([
  ['비활성화', '비활성화할 수 없습니다'],
  ['삭제', '삭제할 수 없습니다'],
] as const)(
  'shows the real prototype restriction for %s and keeps the selected department',
  async (button, title) => {
    await setup();
    const detail = await screen.findByRole('region', { name: '선택 진료과' });
    fireEvent.click(within(detail).getByRole('button', { name: button }));
    let dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: button }));
    dialog = await screen.findByRole('dialog', { name: title });
    expect(within(dialog).getByRole('alert')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '확인' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      within(screen.getByRole('region', { name: '선택 진료과' })).getByRole(
        'heading',
        { name: '내과' },
      ),
    ).toBeTruthy();
  },
);
it('filters medical roles, paginates and resets page after role change', async () => {
  await setup(
    '/admin/departments',
    Array.from({ length: 4 }, (_, i): SelfAccount => ({
      ...mockAccounts.NURSE,
      id: `extra-nurse-${i}`,
      name: `가상간호${i}`,
      email: `nurse${i}@example.test`,
    })),
  );
  await screen.findByRole('table', { name: '소속 의료진' });
  fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
  await screen.findByRole('button', { name: '가상간호3 소속 변경' });
  fireEvent.change(screen.getByLabelText('의료진 역할'), {
    target: { value: 'DOCTOR' },
  });
  await screen.findByRole('button', {
    name: `${mockAccounts.DOCTOR.name} 소속 변경`,
  });
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
  expect(
    screen
      .getByRole('button', { name: '1페이지' })
      .getAttribute('aria-current'),
  ).toBe('page');
});
it('moves a nurse, refreshes medical lists/account cache, and preserves target selection when a doctor is blocked', async () => {
  const { accounts, client } = await setup();
  const target = await create('가상이동목적과');
  const targetId = accounts.all().find((a) => a.role === 'NURSE')!.department!
    .id;
  expect(targetId).toBe('demo-internal');
  expect(
    within(target).getByRole('heading', { name: '가상이동목적과' }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '내과 활성' }));
  fireEvent.click(
    await screen.findByRole('button', {
      name: `${mockAccounts.NURSE.name} 소속 변경`,
    }),
  );
  let dialog = await screen.findByRole('dialog', { name: '의료진 소속 변경' });
  await within(dialog).findByRole('option', { name: '가상이동목적과' });
  const value = (
    within(dialog).getByRole('option', {
      name: '가상이동목적과',
    }) as HTMLOptionElement
  ).value;
  client.setQueryData(
    [
      ...queryKeys.resource(mockAccounts.ADMIN.id, 'admin'),
      'account',
      mockAccounts.NURSE.id,
    ],
    accounts.get(mockAccounts.NURSE.id),
  );
  fireEvent.change(within(dialog).getByLabelText('변경 진료과'), {
    target: { value },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '소속 변경' }));
  dialog = await screen.findByRole('dialog', { name: '소속 변경할까요?' });
  fireEvent.click(within(dialog).getByRole('button', { name: '소속 변경' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(accounts.get(mockAccounts.NURSE.id).department?.id).toBe(value);
  expect(
    client.getQueryState([
      ...queryKeys.resource(mockAccounts.ADMIN.id, 'admin'),
      'account',
      mockAccounts.NURSE.id,
    ])?.isInvalidated,
  ).toBe(true);
  expect(
    screen.queryByRole('button', {
      name: `${mockAccounts.NURSE.name} 소속 변경`,
    }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole('button', {
      name: `${mockAccounts.DOCTOR.name} 소속 변경`,
    }),
  );
  dialog = await screen.findByRole('dialog', { name: '의료진 소속 변경' });
  await within(dialog).findByRole('option', { name: '가상이동목적과' });
  fireEvent.change(within(dialog).getByLabelText('변경 진료과'), {
    target: { value },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '소속 변경' }));
  dialog = await screen.findByRole('dialog', { name: '소속 변경할까요?' });
  fireEvent.click(within(dialog).getByRole('button', { name: '소속 변경' }));
  dialog = await screen.findByRole('dialog', {
    name: '소속을 변경할 수 없습니다',
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '확인' }));
  dialog = await screen.findByRole('dialog', { name: '의료진 소속 변경' });
  expect(
    (within(dialog).getByLabelText('변경 진료과') as HTMLSelectElement).value,
  ).toBe(value);
});
it('refreshes a signed-in nurse scope and clears private caches when admin changes membership', async () => {
  const { s, accounts, auth, client } = await setup(
    '/nurse/patients',
    [],
    'NURSE',
  );
  await screen.findByRole('heading', { name: '접수 환자 현황' });
  const d = s.departments(async () => mockAccounts.ADMIN);
  const target = await d.create('가상새소속과');
  client.setQueryData(['private', 'old-department'], { synthetic: true });
  await act(async () => {
    await d.move(mockAccounts.NURSE.id, target.id);
  });
  await waitFor(() =>
    expect(client.getQueryData(['private', 'old-department'])).toBeUndefined(),
  );
  expect((await auth.me())?.department?.id).toBe(target.id);
  expect(accounts.get(mockAccounts.NURSE.id).department?.id).toBe(target.id);
  await screen.findByText('조건에 맞는 접수 환자가 없습니다.');
});
it('shows load failure and retries without fabricating department data', async () => {
  const { s, client } = await setup();
  await screen.findByRole('table', { name: '소속 의료진' });
  s.development!.setScenario('error');
  await act(async () => {
    await client.invalidateQueries();
  });
  const alert = await screen.findByRole('alert');
  expect(screen.queryByRole('region', { name: '선택 진료과' })).toBeNull();
  s.development!.setScenario('normal');
  fireEvent.click(within(alert).getByRole('button', { name: '다시 시도' }));
  await screen.findByRole('table', { name: '소속 의료진' });
});
it('clears department data on logout and keeps it isolated from the next staff login', async () => {
  const { client } = await setup();
  await screen.findByRole('table', { name: '소속 의료진' });
  fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
  await screen.findByRole('heading', { name: '로그인' });
  expect(client.getQueryCache().getAll()).toEqual([]);
  fireEvent.change(screen.getByLabelText('아이디'), {
    target: { value: 'staff' },
  });
  fireEvent.change(screen.getByLabelText('비밀번호'), {
    target: { value: '1234' },
  });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
  await screen.findByRole('heading', { name: '대시보드' });
  expect(
    client
      .getQueryCache()
      .findAll({ queryKey: queryKeys.account(mockAccounts.ADMIN.id) }),
  ).toEqual([]);
});
it.each(['STAFF', 'NURSE', 'DOCTOR'] as const)(
  'denies %s the admin department route',
  async (role) => {
    await setup('/admin/departments', [], role);
    await screen.findByRole('heading', { name: '403' });
    expect(
      screen.queryByRole('heading', { name: '진료과·의료진 관리' }),
    ).toBeNull();
  },
);
