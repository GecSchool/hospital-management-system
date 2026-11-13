import { createMockStaffService } from '../../services/mock/staff';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation, Link } from 'react-router';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRoutes } from '../../app/router/routes';
import { ApiError } from '../../services/api/errors';
import { createMockAuthService } from '../../services/mock/auth';

function Probe() {
  const location = useLocation();
  return (
    <>
      <output data-testid="location">
        {location.pathname + location.search + location.hash}
      </output>
      <output data-testid="route-state">
        {JSON.stringify(location.state)}
      </output>
      <Link to="/login">test cancel</Link>
    </>
  );
}
function start(
  path: string,
  service = createMockAuthService({ latencyMs: 0 }),
) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders service={service}>
        <AppRoutes staffService={createMockStaffService({ latencyMs: 0 })} />
        <Probe />
      </AppProviders>
    </MemoryRouter>,
  );
  return service;
}
function fillPasswords(
  invitation: boolean,
  password = 'synthetic-new-value',
  confirmation = password,
) {
  fireEvent.change(
    screen.getByLabelText(invitation ? '비밀번호' : '새 비밀번호'),
    { target: { value: password } },
  );
  fireEvent.change(
    screen.getByLabelText(invitation ? '비밀번호 확인' : '새 비밀번호 확인'),
    { target: { value: confirmation } },
  );
}
function submitPassword(invitation: boolean) {
  fireEvent.click(
    screen.getByRole('button', {
      name: invitation ? '가입 완료' : '비밀번호 재설정',
    }),
  );
}
async function login(identifier: string, password = '1234') {
  await screen.findByLabelText('아이디');
  fireEvent.change(screen.getByLabelText('아이디'), {
    target: { value: identifier },
  });
  fireEvent.change(screen.getByLabelText('비밀번호'), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
}

describe('authentication login states', () => {
  it.each([
    ['inactive', '비활성 계정입니다. 시스템 관리자에게 문의해 주세요.'],
    ['server-error', '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'],
    [
      'rate-limited',
      '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    ],
  ])(
    'shows %s and allows recovery with a valid account',
    async (identifier, message) => {
      start('/login');
      await login(identifier);
      expect((await screen.findByRole('alert')).textContent).toBe(message);
      await login('staff');
      await screen.findByRole('heading', { name: '대시보드' });
    },
  );
  it('validates required fields before calling the service', async () => {
    const service = createMockAuthService({ latencyMs: 0 });
    service.login = vi.fn(service.login);
    start('/login', service);
    await screen.findByLabelText('아이디');
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(service.login).not.toHaveBeenCalled();
  });
  it('validates API email format without sending a request', async () => {
    const service = createMockAuthService({ latencyMs: 0 });
    Object.defineProperty(service, 'loginIdentifier', { value: 'email' });
    service.login = vi.fn(service.login);
    start('/login', service);
    await screen.findByLabelText('이메일');
    fireEvent.change(screen.getByLabelText('이메일'), {
      target: { value: 'staff' },
    });
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: '1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect(screen.getByRole('alert').textContent).toBe(
      '올바른 이메일 주소를 입력해 주세요.',
    );
    expect(service.login).not.toHaveBeenCalled();
  });
  it('falls back to the signed-in role home for an unauthorized original destination', async () => {
    start('/admin/accounts');
    await login('doctor');
    await screen.findByRole('heading', { name: '진료 일정' });
    expect(screen.getByTestId('location').textContent).toBe('/doctor/schedule');
  });
  it('restores the existing adapter session on bootstrap', async () => {
    const service = createMockAuthService({ latencyMs: 0 });
    await service.login({ identifier: 'nurse', password: '1234' });
    start('/', service);
    await screen.findByRole('heading', { name: '접수 환자 현황' });
  });
});

describe.each([
  [
    'invitation',
    '/invitations/accept',
    '계정 설정',
    '계정 설정이 완료되었습니다. 로그인해 주세요.',
  ],
  [
    'reset',
    '/password-reset',
    '비밀번호 재설정',
    '비밀번호가 재설정되었습니다. 로그인해 주세요.',
  ],
] as const)('%s link flows', (kind, path, title, notice) => {
  const invitation = kind === 'invitation';
  const validToken = `demo-${kind}-doctor`;
  it.each(['query', 'fragment'])(
    'verifies a %s token, scrubs it, completes, and consumes the link once',
    async (source) => {
      const service = start(
        `${path}${source === 'query' ? '?' : '#'}token=${validToken}`,
      );
      await screen.findByRole('heading', { name: title });
      expect(screen.getByTestId('location').textContent).toBe(path);
      expect(screen.getByTestId('route-state').textContent).not.toContain(
        validToken,
      );
      expect(document.body.textContent).not.toContain(validToken);
      fillPasswords(invitation);
      submitPassword(invitation);
      await screen.findByText(notice);
      expect(screen.getByTestId('location').textContent).toBe('/login');
      expect(document.body.textContent).not.toContain('synthetic-new-value');
      const verify = invitation
        ? service.verifyInvitation
        : service.verifyPasswordReset;
      await expect(verify(validToken)).rejects.toMatchObject({ status: 410 });
      // Simulations deliberately discard new passwords and preserve development credentials.
      await login('doctor');
      await screen.findByRole('heading', { name: '진료 일정' });
    },
  );
  it.each(['', 'unknown', 'expired'])(
    'rejects a missing or invalid token (%s)',
    async (scenario) => {
      start(`${path}${scenario ? `?token=demo-${kind}-${scenario}` : ''}`);
      await screen.findByRole('heading', {
        name: `${invitation ? '초대' : '재설정'} 링크를 사용할 수 없어요`,
      });
      expect(
        screen.queryByLabelText(invitation ? '비밀번호' : '새 비밀번호'),
      ).toBeNull();
      fireEvent.click(
        screen.getByRole('button', { name: '로그인으로 돌아가기' }),
      );
      await screen.findByRole('heading', { name: '로그인' });
    },
  );
  it('does not accept ambiguous duplicate tokens and removes both', async () => {
    const service = createMockAuthService({ latencyMs: 0 });
    service.verifyInvitation = vi.fn(service.verifyInvitation);
    service.verifyPasswordReset = vi.fn(service.verifyPasswordReset);
    start(`${path}?token=${validToken}#token=${validToken}`, service);
    await screen.findByRole('heading', { name: /링크를 사용할 수 없어요/ });
    expect(screen.getByTestId('location').textContent).toBe(path);
    expect(service.verifyInvitation).not.toHaveBeenCalled();
    expect(service.verifyPasswordReset).not.toHaveBeenCalled();
  });
  it('validates empty and mismatched passwords before submission', async () => {
    const service = start(`${path}?token=${validToken}`);
    service.acceptInvitation = vi.fn(service.acceptInvitation);
    service.confirmPasswordReset = vi.fn(service.confirmPasswordReset);
    await screen.findByRole('heading', { name: title });
    submitPassword(invitation);
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    fillPasswords(invitation, 'synthetic-new-value', 'different');
    submitPassword(invitation);
    expect(screen.getByRole('alert').textContent).toBe(
      '비밀번호가 일치하지 않습니다.',
    );
    expect(service.acceptInvitation).not.toHaveBeenCalled();
    expect(service.confirmPasswordReset).not.toHaveBeenCalled();
  });
  it('recovers from a verification server error with explicit retry', async () => {
    const service = createMockAuthService({ latencyMs: 0 });
    if (invitation)
      service.verifyInvitation = vi
        .fn(service.verifyInvitation)
        .mockRejectedValueOnce(new ApiError('SERVER_ERROR', 'test', 500));
    else
      service.verifyPasswordReset = vi
        .fn(service.verifyPasswordReset)
        .mockRejectedValueOnce(new ApiError('SERVER_ERROR', 'test', 500));
    start(`${path}?token=${validToken}`, service);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await screen.findByRole('heading', { name: title });
  });
  it('shows expired state when the link expires during submission', async () => {
    start(`${path}?token=demo-${kind}-expires-on-submit`);
    await screen.findByRole('heading', { name: title });
    fillPasswords(invitation);
    submitPassword(invitation);
    await screen.findByRole('heading', { name: /링크를 사용할 수 없어요/ });
  });
  it('clears password inputs after server failure and allows resubmission', async () => {
    const service = createMockAuthService({ latencyMs: 0 });
    if (invitation)
      service.acceptInvitation = vi
        .fn(service.acceptInvitation)
        .mockRejectedValueOnce(new ApiError('SERVER_ERROR', 'test', 500));
    else
      service.confirmPasswordReset = vi
        .fn(service.confirmPasswordReset)
        .mockRejectedValueOnce(new ApiError('SERVER_ERROR', 'test', 500));
    start(`${path}?token=${validToken}`, service);
    await screen.findByRole('heading', { name: title });
    fillPasswords(invitation);
    submitPassword(invitation);
    expect((await screen.findByRole('alert')).textContent).toContain(
      '서버에 연결할 수 없습니다.',
    );
    expect(
      (
        screen.getByLabelText(
          invitation ? '비밀번호' : '새 비밀번호',
        ) as HTMLInputElement
      ).value,
    ).toBe('');
    fillPasswords(invitation);
    submitPassword(invitation);
    await screen.findByText(notice);
  });
  it('disables pending submission and prevents duplicate requests', async () => {
    let finish!: () => void;
    const service = createMockAuthService({ latencyMs: 0 });
    const submit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    if (invitation) service.acceptInvitation = submit;
    else service.confirmPasswordReset = submit;
    start(`${path}?token=${validToken}`, service);
    await screen.findByRole('heading', { name: title });
    fillPasswords(invitation);
    submitPassword(invitation);
    const button = screen.getByRole('button', { name: '처리 중…' });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await screen.findByText(notice);
  });
  it('does not navigate to success after leaving a pending submission', async () => {
    let finish!: () => void;
    const service = createMockAuthService({ latencyMs: 0 });
    const pending = () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      });
    if (invitation) service.acceptInvitation = pending;
    else service.confirmPasswordReset = pending;
    start(`${path}?token=${validToken}`, service);
    await screen.findByRole('heading', { name: title });
    fillPasswords(invitation);
    submitPassword(invitation);
    fireEvent.click(
      screen.getByRole('link', {
        name: invitation
          ? '이미 계정이 있나요? 로그인으로 이동'
          : '로그인으로 돌아가기',
      }),
    );
    await screen.findByRole('heading', { name: '로그인' });
    await act(async () => finish());
    expect(screen.queryByText(notice)).toBeNull();
  });
  it('allows returning to login before submission', async () => {
    start(`${path}?token=${validToken}`);
    await screen.findByRole('heading', { name: title });
    fireEvent.click(
      screen.getByRole('link', {
        name: invitation
          ? '이미 계정이 있나요? 로그인으로 이동'
          : '로그인으로 돌아가기',
      }),
    );
    await screen.findByRole('heading', { name: '로그인' });
  });
});

it.each(['DOCTOR', 'ADMIN', 'STAFF', 'NURSE'])(
  'displays synthetic %s invitation information',
  async (role) => {
    start(`/invitations/accept?token=demo-invitation-${role.toLowerCase()}`);
    await screen.findByRole('heading', { name: '초대 정보' });
    expect(screen.getByText(`${role.toLowerCase()}@example.test`)).toBeTruthy();
    expect(screen.queryByText('소속 진료과') === null).toBe(role === 'ADMIN');
  },
);
