import { createMockStaffService } from '../../services/mock/staff';
import { describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { AxiosError } from 'axios';
import { MemoryRouter, useLocation } from 'react-router';
import { AppProviders } from '../providers/AppProviders';
import { createQueryClient } from '../providers/queryClient';
import type { AuthService } from '../../features/auth/authService';
import { ApiError } from '../../services/api/errors';
import { apiClient } from '../../services/api/client';
import { createMockAuthService, mockAccounts } from '../../services/mock/auth';
import { roleHome, roleLabels, type Role } from '../../types/auth';
import { AppRoutes } from './routes';

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="current-location">
      {location.pathname + location.search}
    </output>
  );
}

function renderRoutes(
  path: string,
  service: AuthService,
  client = createQueryClient(),
) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders service={service} client={client}>
        <AppRoutes staffService={createMockStaffService({ latencyMs: 0 })} />
        <LocationProbe />
      </AppProviders>
    </MemoryRouter>,
  );
  return client;
}

function authenticatedService(role: Role): AuthService {
  return {
    ...createMockAuthService({ latencyMs: 0 }),
    loginIdentifier: 'username',
    me: vi.fn().mockResolvedValue(structuredClone(mockAccounts[role])),
    login: vi.fn().mockResolvedValue(structuredClone(mockAccounts[role])),
    logout: vi.fn().mockResolvedValue(undefined),
  };
}

async function submitStaffLogin() {
  await screen.findByRole('heading', { name: '로그인' });
  fireEvent.change(screen.getByLabelText('아이디'), {
    target: { value: 'staff' },
  });
  fireEvent.change(screen.getByLabelText('비밀번호'), {
    target: { value: '1234' },
  });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
}

describe('role routing and authentication boundaries', () => {
  it.each([
    ['staff', '/staff', '대시보드'],
    ['doctor', '/doctor/schedule', '진료 일정'],
    ['nurse', '/nurse/patients', '접수 환자 현황'],
    ['admin', '/admin', '관리자 대시보드'],
  ])(
    'logs in with the development username %s and password 1234',
    async (identifier, home, title) => {
      renderRoutes('/login', createMockAuthService());
      const input = await screen.findByLabelText<HTMLInputElement>('아이디');
      expect(input.type).toBe('text');
      fireEvent.change(input, { target: { value: identifier } });
      expect(input.checkValidity()).toBe(true);
      fireEvent.change(screen.getByLabelText('비밀번호'), {
        target: { value: '1234' },
      });
      fireEvent.click(screen.getByRole('button', { name: '로그인' }));
      await screen.findByRole('heading', { name: title });
      expect(screen.getByTestId('current-location').textContent).toBe(home);
    },
  );

  it.each([
    ['staff', 'wrong'],
    ['unknown', '1234'],
    ['staff@example.test', '1234'],
  ])(
    'shows an error for invalid development credentials %s',
    async (identifier, password) => {
      renderRoutes('/login', createMockAuthService());
      await screen.findByLabelText('아이디');
      fireEvent.change(screen.getByLabelText('아이디'), {
        target: { value: identifier },
      });
      fireEvent.change(screen.getByLabelText('비밀번호'), {
        target: { value: password },
      });
      fireEvent.click(screen.getByRole('button', { name: '로그인' }));
      expect((await screen.findByRole('alert')).textContent).toBe(
        '아이디 또는 비밀번호가 올바르지 않습니다.',
      );
      expect(screen.getByTestId('current-location').textContent).toBe('/login');
      expect(
        (screen.getByLabelText('비밀번호') as HTMLInputElement).value,
      ).toBe('');
    },
  );

  it('keeps the real API login UI email-based', async () => {
    const service: AuthService = {
      ...authenticatedService('STAFF'),
      me: vi.fn().mockResolvedValue(null),
      loginIdentifier: 'email',
    };
    renderRoutes('/login', service);
    const input = await screen.findByLabelText<HTMLInputElement>('이메일');
    expect(input.type).toBe('email');
    fireEvent.change(input, { target: { value: 'staff' } });
    expect(input.checkValidity()).toBe(false);
    expect(screen.queryByLabelText('아이디')).toBeNull();
  });
  it.each([
    [
      'STAFF',
      '/staff/appointments/demo-appointment',
      '예약·접수 현황',
      '예약 상세',
    ],
    ['DOCTOR', '/doctor/visits/demo-visit', '환자 진료', '환자 진료'],
    [
      'NURSE',
      '/nurse/receptions/demo-reception/records',
      '접수 환자',
      '간호 기록',
    ],
  ] as const)(
    'marks the related %s menu current on a detail route',
    async (role, path, menu, title) => {
      renderRoutes(path, authenticatedService(role));
      await screen.findByRole('heading', { name: title });
      expect(
        screen.getByRole('link', { name: menu }).getAttribute('aria-current'),
      ).toBe('page');
    },
  );
  it('redirects an anonymous protected request to the login layout', async () => {
    renderRoutes('/staff/patients', createMockAuthService());
    await screen.findByRole('heading', { name: '로그인' });
    expect(screen.getByTestId('current-location').textContent).toBe('/login');
    expect(screen.getByText('진료 예약 및 환자 관리 시스템')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
  });

  it.each([
    ['STAFF', '대시보드', ['대시보드', '환자 관리', '예약·접수 현황']],
    ['DOCTOR', '진료 일정', ['진료 일정', '환자 진료', '진료 시간 설정']],
    ['NURSE', '접수 환자 현황', ['접수 환자', '예약 등록']],
    ['ADMIN', '관리자 대시보드', ['대시보드', '계정 관리', '진료과·의료진']],
  ] as const)(
    'renders the %s home with its own shell and menu',
    async (role, title, labels) => {
      renderRoutes('/', authenticatedService(role));
      await screen.findByRole('heading', { name: title });
      expect(screen.getByTestId('current-location').textContent).toBe(
        roleHome[role],
      );
      const navigation = screen.getByRole('navigation', { name: '주 메뉴' });
      expect(
        within(navigation)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(labels);
      expect(
        screen.getByRole('complementary', { name: `${roleLabels[role]} 메뉴` }),
      ).toBeTruthy();
      expect(screen.getByAltText('숭실대학교 심벌').getAttribute('width')).toBe(
        '84',
      );
      expect(
        screen.getByText(mockAccounts[role].name, { exact: false }),
      ).toBeTruthy();
      expect(screen.getByRole('button', { name: '로그아웃' })).toBeTruthy();
    },
  );

  it('denies a signed-in user who requests another role route', async () => {
    renderRoutes('/admin/accounts', authenticatedService('STAFF'));
    await screen.findByRole('heading', { name: '403' });
    expect(screen.getByTestId('current-location').textContent).toBe('/403');
    expect(screen.queryByRole('heading', { name: '계정 관리' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
  });

  it('renders 404 for an unknown route', async () => {
    renderRoutes('/unknown-screen', createMockAuthService());
    await screen.findByRole('heading', { name: '404' });
    expect(screen.getByText('요청한 페이지를 찾을 수 없습니다.')).toBeTruthy();
  });

  it('logs in and out through the adapter and clears private query data on each transition', async () => {
    const service = createMockAuthService();
    const client = renderRoutes('/login', service);
    await screen.findByRole('heading', { name: '로그인' });
    client.setQueryData(['private', 'previous-account'], {
      sensitive: 'synthetic-test-only',
    });

    await submitStaffLogin();
    await screen.findByRole('heading', { name: '대시보드' });
    expect(
      client.getQueryData(['private', 'previous-account']),
    ).toBeUndefined();
    expect((await service.me())?.role).toBe('STAFF');
    client.setQueryData(['private', 'patients'], { synthetic: true });

    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    await screen.findByRole('heading', { name: '로그인' });
    expect(client.getQueryData(['private', 'patients'])).toBeUndefined();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(await service.me()).toBeNull();
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
  });

  it('keeps protected content hidden when bootstrap fails and retries explicitly', async () => {
    const service = authenticatedService('STAFF');
    const me = vi
      .fn<AuthService['me']>()
      .mockRejectedValueOnce(
        new ApiError(
          'SERVER_UNAVAILABLE',
          '계정 정보를 확인하지 못했습니다.',
          500,
        ),
      )
      .mockResolvedValueOnce(structuredClone(mockAccounts.STAFF));
    service.me = me;
    renderRoutes('/staff/patients', service);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('계정 정보를 확인하지 못했습니다.');
    expect(screen.queryByRole('heading', { name: '환자 목록' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
    expect(screen.getByTestId('current-location').textContent).toBe(
      '/staff/patients',
    );

    fireEvent.click(within(alert).getByRole('button', { name: '다시 시도' }));
    await screen.findByRole('heading', { name: '환자 목록' });
    expect(me).toHaveBeenCalledTimes(2);
  });

  it('retains the current account after logout failure and lets the user retry', async () => {
    const service = authenticatedService('STAFF');
    const logout = vi
      .fn<AuthService['logout']>()
      .mockRejectedValueOnce(
        new ApiError('SERVER_UNAVAILABLE', '서버 오류', 500),
      )
      .mockResolvedValueOnce(undefined);
    service.logout = logout;
    const client = renderRoutes('/staff', service);
    await screen.findByRole('heading', { name: '대시보드' });
    client.setQueryData(['private', 'current-account'], { synthetic: true });

    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(
      '로그아웃하지 못했습니다. 다시 시도해 주세요.',
    );
    expect(screen.getByRole('heading', { name: '대시보드' })).toBeTruthy();
    expect(screen.getByTestId('current-location').textContent).toBe('/staff');
    expect(client.getQueryData(['private', 'current-account'])).toEqual({
      synthetic: true,
    });

    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    await screen.findByRole('heading', { name: '로그인' });
    expect(logout).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(['private', 'current-account'])).toBeUndefined();
  });

  it('ignores an old pending logout after session expiration and a new account login', async () => {
    let finishOldLogout!: () => void;
    const pendingLogout = new Promise<void>((resolve) => {
      finishOldLogout = resolve;
    });
    const service = authenticatedService('STAFF');
    service.logout = vi.fn().mockReturnValue(pendingLogout);
    service.login = vi
      .fn()
      .mockResolvedValue(structuredClone(mockAccounts.ADMIN));
    const client = renderRoutes('/staff', service);
    await screen.findByRole('heading', { name: '대시보드' });
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    expect(
      screen
        .getByRole('button', { name: '로그아웃 중…' })
        .hasAttribute('disabled'),
    ).toBe(true);

    await act(async () => {
      await apiClient
        .get('/patients', {
          adapter: (config) =>
            Promise.reject(
              new AxiosError(
                'Expired session',
                'ERR_BAD_REQUEST',
                config,
                undefined,
                {
                  config,
                  status: 401,
                  statusText: 'Unauthorized',
                  headers: {},
                  data: { error: { code: 'UNAUTHENTICATED' } },
                },
              ),
            ),
        })
        .catch(() => undefined);
    });
    await screen.findByRole('heading', { name: '로그인' });
    fireEvent.change(screen.getByLabelText('아이디'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: '1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    await screen.findByRole('heading', { name: '관리자 대시보드' });
    client.setQueryData(['private', 'new-account'], { synthetic: 'admin' });

    await act(async () => {
      finishOldLogout();
      await pendingLogout;
    });
    expect(
      screen.getByRole('heading', { name: '관리자 대시보드' }),
    ).toBeTruthy();
    expect(screen.getByTestId('current-location').textContent).toBe('/admin');
    expect(client.getQueryData(['private', 'new-account'])).toEqual({
      synthetic: 'admin',
    });
  });

  it('restores an authorized protected deep link and query after login', async () => {
    renderRoutes(
      '/staff/patients/demo-patient?view=history',
      createMockAuthService(),
    );
    await submitStaffLogin();
    await screen.findByRole('heading', { name: '환자 상세' });
    await waitFor(() => {
      expect(screen.getByTestId('current-location').textContent).toBe(
        '/staff/patients/demo-patient?view=history',
      );
    });
    expect(
      screen
        .getByRole('link', { name: '환자 관리' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });
});
