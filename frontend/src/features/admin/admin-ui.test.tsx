import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  act,
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { createMockStaffService } from '../../services/mock/staff';
import { createMockAccountStore } from '../../services/mock/accounts';
import { createMockAuthService, mockAccounts } from '../../services/mock/auth';
import { createQueryClient } from '../../app/providers/queryClient';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRoutes } from '../../app/router/routes';
import { queryKeys } from '../../services/api/queryKeys';
import type { SelfAccount, Role } from '../../types/auth';

vi.mock('../../services/mode', () => ({ apiMode: 'mock' }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T03:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function Location() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname + location.search}
    </output>
  );
}
async function setup(
  path = '/admin',
  extra: SelfAccount[] = [],
  role: Role | null = 'ADMIN',
) {
  const accounts = createMockAccountStore([
    ...Object.values(mockAccounts),
    ...extra,
  ]);
  const s = createMockStaffService({ accounts, latencyMs: 0 });
  const auth = createMockAuthService({ accounts, latencyMs: 0 });
  if (role)
    await auth.login({ identifier: role.toLowerCase(), password: '1234' });
  const client = createQueryClient();
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders service={auth} client={client}>
        <AppRoutes staffService={s} />
        <Location />
      </AppProviders>
    </MemoryRouter>,
  );
  return { s, accounts, auth, client, ...result };
}
async function openAccount(name: string) {
  fireEvent.click(await screen.findByRole('link', { name: `${name} 관리` }));
  const dialog = await screen.findByRole('dialog', { name: '계정 상세' });
  await within(dialog).findByText(name);
  return dialog;
}

it('renders dynamic active role/department metrics and follows the real admin shortcut/menu', async () => {
  const { accounts } = await setup();
  await screen.findByRole('heading', { name: '역할별 활성 계정' });
  const metrics = screen.getByRole('region', { name: '역할별 활성 계정' });
  expect(within(metrics).getAllByText('1')).toHaveLength(4);
  const departments = screen.getByRole('region', { name: '진료과 현황' });
  expect(within(departments).getByText('2')).toBeTruthy();
  expect(within(departments).getByText('0')).toBeTruthy();
  expect(accounts.all()).toHaveLength(4);
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: '관리자 바로가기' }),
    ).getByRole('link', { name: '계정 관리 ›' }),
  );
  await screen.findByRole('table', { name: '계정 목록' });
  expect(screen.getByTestId('location').textContent).toBe('/admin/accounts');
});
it('supports filters, page navigation and resets to page 1 on combined search without putting text in the URL', async () => {
  const { client } = await setup('/admin/accounts', [
    {
      ...mockAccounts.STAFF,
      id: 'extra-staff',
      name: '가상 추가 직원',
      email: 'additional@example.test',
    },
  ]);
  await screen.findByRole('table', { name: '계정 목록' });
  fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
  await screen.findByText('가상 추가 직원');
  expect(screen.getByTestId('location').textContent).toBe(
    '/admin/accounts?page=2',
  );
  fireEvent.change(screen.getByLabelText('이름'), {
    target: { value: '간호' },
  });
  fireEvent.change(screen.getByLabelText('이메일'), {
    target: { value: 'nurse@' },
  });
  fireEvent.change(screen.getByLabelText('역할'), {
    target: { value: 'NURSE' },
  });
  fireEvent.change(screen.getByLabelText('상태'), {
    target: { value: 'ACTIVE' },
  });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  await screen.findByRole('link', { name: `${mockAccounts.NURSE.name} 관리` });
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
  expect(screen.getByTestId('location').textContent).toBe(
    '/admin/accounts?page=1',
  );
  expect(
    JSON.stringify(
      client
        .getQueryCache()
        .getAll()
        .map((q) => q.queryKey),
    ),
  ).not.toContain('nurse@');
  fireEvent.change(screen.getByLabelText('이메일'), {
    target: { value: 'doctor@' },
  });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  await screen.findByText('검색 조건에 맞는 계정이 없습니다.');
});
it('opens account detail, shows only summary fields, and closes back to the list', async () => {
  await setup('/admin/accounts');
  const dialog = await openAccount(mockAccounts.NURSE.name);
  expect(within(dialog).getByText(mockAccounts.NURSE.email)).toBeTruthy();
  expect(within(dialog).getByText('내과')).toBeTruthy();
  fireEvent.click(
    within(dialog).getByRole('button', { name: '계정 상세 닫기' }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByTestId('location').textContent).toBe(
    '/admin/accounts?page=1',
  );
});
it('reports account detail 404 and returns to the existing account list', async () => {
  await setup('/admin/accounts/missing');
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByText('계정을 찾을 수 없습니다.');
  fireEvent.click(
    within(dialog).getByRole('button', { name: '목록으로 돌아가기' }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
it('deactivates/reactivates accounts with confirmations, refreshes detail/list/dashboard, and preserves account identifiers', async () => {
  const { client, accounts } = await setup();
  await screen.findByRole('heading', { name: '역할별 활성 계정' });
  fireEvent.click(
    within(screen.getByRole('navigation', { name: '주 메뉴' })).getByRole(
      'link',
      { name: '계정 관리' },
    ),
  );
  let dialog = await openAccount(mockAccounts.STAFF.name);
  fireEvent.click(within(dialog).getByRole('button', { name: '비활성화' }));
  dialog = await screen.findByRole('dialog', {
    name: '계정 상태를 변경할까요?',
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '비활성화' }));
  await waitFor(() =>
    expect(accounts.get(mockAccounts.STAFF.id).status).toBe('INACTIVE'),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    client.getQueryState([
      ...queryKeys.resource(mockAccounts.ADMIN.id, 'admin'),
      'dashboard',
    ])?.isInvalidated,
  ).toBe(true);
  dialog = await openAccount(mockAccounts.STAFF.name);
  expect(within(dialog).getByText('비활성')).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: '활성화' }));
  dialog = await screen.findByRole('dialog', {
    name: '계정 상태를 변경할까요?',
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '활성화' }));
  await waitFor(() =>
    expect(accounts.get(mockAccounts.STAFF.id).status).toBe('ACTIVE'),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(
    within(screen.getByRole('navigation', { name: '주 메뉴' })).getByRole(
      'link',
      { name: '대시보드' },
    ),
  );
  const metrics = await screen.findByRole('region', {
    name: '역할별 활성 계정',
  });
  expect(within(metrics).getAllByText('1')).toHaveLength(4);
});
it.each([
  ['ADMIN', '마지막 활성 관리자 계정은 비활성화할 수 없습니다.'],
  ['DOCTOR', '처리되지 않은 예약·접수·진료가 있어 비활성화할 수 없습니다.'],
] as const)(
  'shows the prototype restriction for %s and keeps original status',
  async (role, message) => {
    const { accounts } = await setup('/admin/accounts');
    let dialog = await openAccount(mockAccounts[role].name);
    fireEvent.click(within(dialog).getByRole('button', { name: '비활성화' }));
    dialog = await screen.findByRole('dialog', {
      name: '계정 상태를 변경할까요?',
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '비활성화' }));
    await within(dialog).findByText(message);
    expect(accounts.get(mockAccounts[role].id).status).toBe('ACTIVE');
    fireEvent.click(within(dialog).getByRole('button', { name: '확인' }));
    await screen.findByRole('dialog', { name: '계정 상세' });
  },
);
it('logs out and clears private caches immediately after self-deactivation, without late query repopulation', async () => {
  const { client, auth, accounts } = await setup('/admin/accounts', [
    {
      ...mockAccounts.ADMIN,
      id: 'other-admin',
      email: 'other-admin@example.test',
    },
  ]);
  let dialog = await openAccount(mockAccounts.ADMIN.name);
  client.setQueryData(['private', 'old-account'], { synthetic: true });
  fireEvent.click(within(dialog).getByRole('button', { name: '비활성화' }));
  dialog = await screen.findByRole('dialog', {
    name: '계정 상태를 변경할까요?',
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '비활성화' }));
  await screen.findByRole('heading', { name: '로그인' });
  expect(accounts.get(mockAccounts.ADMIN.id).status).toBe('INACTIVE');
  expect(await auth.me()).toBeNull();
  expect(client.getQueryCache().getAll()).toEqual([]);
  expect(client.getMutationCache().getAll()).toEqual([]);
});
it('handles invite validation and role-specific departments, clears hidden selections, and requires confirmation', async () => {
  const { accounts } = await setup('/admin/accounts');
  fireEvent.click(await screen.findByRole('button', { name: '계정 초대' }));
  let dialog = await screen.findByRole('dialog', { name: '계정 초대' });
  fireEvent.click(within(dialog).getByRole('button', { name: '초대 발송' }));
  expect(within(dialog).getByText('이름을 입력해 주세요.')).toBeTruthy();
  expect(
    within(dialog).getByText('올바른 이메일을 입력해 주세요.'),
  ).toBeTruthy();
  fireEvent.change(within(dialog).getByLabelText('이름'), {
    target: { value: '가상 초대 사용자' },
  });
  fireEvent.change(within(dialog).getByLabelText('이메일'), {
    target: { value: 'invited@example.test' },
  });
  fireEvent.change(within(dialog).getByLabelText('역할'), {
    target: { value: 'DOCTOR' },
  });
  await within(dialog).findByRole('option', { name: '내과' });
  fireEvent.click(within(dialog).getByRole('button', { name: '초대 발송' }));
  expect(within(dialog).getByText('활성 진료과를 선택해 주세요.')).toBeTruthy();
  fireEvent.change(within(dialog).getByLabelText('소속 진료과'), {
    target: { value: 'demo-internal' },
  });
  fireEvent.change(within(dialog).getByLabelText('역할'), {
    target: { value: 'STAFF' },
  });
  expect(within(dialog).queryByLabelText('소속 진료과')).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: '초대 발송' }));
  dialog = await screen.findByRole('dialog', {
    name: '계정 초대를 요청할까요?',
  });
  expect(accounts.latestToken('invitation')).toBeUndefined();
  fireEvent.click(
    within(dialog).getByRole('button', { name: '초대 요청 확정' }),
  );
  await screen.findByText(
    '개발용 Mock 초대 요청을 등록했습니다. 실제 이메일은 발송되지 않았으며 수락 전 계정은 생성되지 않습니다.',
    { selector: '[role="status"]' },
  );
  expect(accounts.all()).toHaveLength(4);
  expect(
    accounts.verifyInvitation(accounts.latestToken('invitation')!),
  ).toMatchObject({ role: 'STAFF', department: null });
});
it('retries invite errors once, suppresses double submits and does not retain form data after closing', async () => {
  const { s, accounts } = await setup('/admin/accounts');
  fireEvent.click(await screen.findByRole('button', { name: '계정 초대' }));
  let dialog = await screen.findByRole('dialog', { name: '계정 초대' });
  fireEvent.change(within(dialog).getByLabelText('이름'), {
    target: { value: '가상 초대' },
  });
  fireEvent.change(within(dialog).getByLabelText('이메일'), {
    target: { value: 'new@example.test' },
  });
  fireEvent.change(within(dialog).getByLabelText('역할'), {
    target: { value: 'ADMIN' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '초대 발송' }));
  dialog = await screen.findByRole('dialog', {
    name: '계정 초대를 요청할까요?',
  });
  s.development!.setScenario('save-error');
  fireEvent.click(
    within(dialog).getByRole('button', { name: '초대 요청 확정' }),
  );
  await within(dialog).findByRole('alert');
  expect(accounts.latestToken('invitation')).toBeUndefined();
  s.development!.setScenario('normal');
  const invite = vi.spyOn(accounts, 'invite');
  const button = within(dialog).getByRole('button', { name: '초대 요청 확정' });
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByText(
    '개발용 Mock 초대 요청을 등록했습니다. 실제 이메일은 발송되지 않았으며 수락 전 계정은 생성되지 않습니다.',
    { selector: '[role="status"]' },
  );
  expect(invite).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: '계정 초대' }));
  dialog = await screen.findByRole('dialog', { name: '계정 초대' });
  expect(
    (within(dialog).getByLabelText('이름') as HTMLInputElement).value,
  ).toBe('');
  fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
it('requests password reset on inactive accounts with a confirmation and handles errors without activating or double submitting', async () => {
  const { s, accounts } = await setup('/admin/accounts');
  accounts.setStatus(mockAccounts.NURSE.id, 'INACTIVE');
  let dialog = await openAccount(mockAccounts.NURSE.name);
  fireEvent.click(
    within(dialog).getByRole('button', { name: '비밀번호 재설정 링크 발송' }),
  );
  dialog = await screen.findByRole('dialog', {
    name: '재설정 링크를 발송할까요?',
  });
  s.development!.setScenario('save-error');
  fireEvent.click(within(dialog).getByRole('button', { name: '링크 발송' }));
  await within(dialog).findByRole('alert');
  expect(accounts.latestToken('reset')).toBeUndefined();
  s.development!.setScenario('normal');
  const reset = vi.spyOn(accounts, 'reset');
  const button = within(dialog).getByRole('button', {
    name: '링크 발송',
  });
  fireEvent.click(button);
  fireEvent.click(button);
  dialog = await screen.findByRole('dialog', { name: '계정 상세' });
  await within(dialog).findByRole('status');
  expect(reset).toHaveBeenCalledOnce();
  expect(accounts.get(mockAccounts.NURSE.id).status).toBe('INACTIVE');
});
it('retries dashboard load errors and shows no fabricated successful data', async () => {
  const { s, client } = await setup();
  await screen.findByRole('region', { name: '역할별 활성 계정' });
  s.development!.setScenario('error');
  await act(async () => {
    await client.invalidateQueries();
  });
  const alert = await screen.findByRole('alert');
  expect(screen.queryByRole('region', { name: '역할별 활성 계정' })).toBeNull();
  s.development!.setScenario('normal');
  fireEvent.click(within(alert).getByRole('button', { name: '다시 시도' }));
  await screen.findByRole('region', { name: '역할별 활성 계정' });
});
it.each(['STAFF', 'NURSE', 'DOCTOR'] as const)(
  'blocks %s from admin routes before data requests',
  async (role) => {
    const { client } = await setup('/admin/accounts/demo-nurse', [], role);
    await screen.findByRole('heading', { name: '403' });
    expect(client.getQueryCache().getAll()).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
  },
);
it('requires login for anonymous admin access', async () => {
  const { client } = await setup('/admin/accounts', [], null);
  await screen.findByRole('heading', { name: '로그인' });
  expect(client.getQueryCache().getAll()).toEqual([]);
});
it('renders zero-value API statistics with an explicit empty state', async () => {
  const { client } = await setup();
  await screen.findByRole('region', { name: '역할별 활성 계정' });
  // Zero server statistics must be rendered as supplied, never replaced with demo counts.
  await act(async () => {
    client.setQueryData(
      [...queryKeys.resource(mockAccounts.ADMIN.id, 'admin'), 'dashboard'],
      {
        accountsByRole: { STAFF: 0, DOCTOR: 0, NURSE: 0, ADMIN: 0 },
        departmentsByStatus: { ACTIVE: 0, INACTIVE: 0 },
      },
    );
  });
  await screen.findByText('집계할 계정과 진료과가 없습니다.');
  expect(
    within(
      screen.getByRole('region', { name: '역할별 활성 계정' }),
    ).getAllByText('0'),
  ).toHaveLength(4);
});
it('clears admin data when logging out and signing in as a different role', async () => {
  const { client } = await setup('/admin/accounts');
  await screen.findByRole('table');
  expect(client.getQueryCache().getAll().length).toBeGreaterThan(0);
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
    client.getQueryCache().findAll({
      queryKey: queryKeys.resource(mockAccounts.ADMIN.id, 'admin'),
    }),
  ).toEqual([]);
});
