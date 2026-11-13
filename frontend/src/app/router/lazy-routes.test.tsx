import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AppProviders } from '../providers/AppProviders';
import { AppErrorBoundary } from '../providers/AppErrorBoundary';
import { createQueryClient } from '../providers/queryClient';
import { createMockAuthService } from '../../services/mock/auth';
import { createMockStaffService } from '../../services/mock/staff';
import { AppRoutes } from './routes';
import type { AdminService } from '../../features/admin/service';

const gate = vi.hoisted(() => {
  let release!: () => void;
  return {
    ready: new Promise<void>((resolve) => {
      release = resolve;
    }),
    release: () => release(),
    loads: 0,
  };
});
vi.mock('./pages/admin', async () => {
  gate.loads += 1;
  await gate.ready;
  return vi.importActual('./pages/admin');
});
vi.mock('./pages/nurse', () => {
  throw new Error('Synthetic chunk failure');
});
afterEach(() => vi.restoreAllMocks());

async function start(path: string, identifier?: string) {
  const auth = createMockAuthService({ latencyMs: 0 });
  if (identifier) await auth.login({ identifier, password: '1234' });
  const service = createMockStaffService({ latencyMs: 0 });
  const accountReads = vi.fn();
  const admin = service.admin;
  service.admin = (principal) => {
    const target = admin(principal);
    return {
      ...target,
      list: (...args: Parameters<AdminService['list']>) => {
        accountReads();
        return target.list(...args);
      },
    };
  };
  const client = createQueryClient();
  const view = render(
    <AppErrorBoundary>
      <MemoryRouter initialEntries={[path]}>
        <AppProviders service={auth} client={client}>
          <AppRoutes staffService={service} />
        </AppProviders>
      </MemoryRouter>
    </AppErrorBoundary>,
  );
  return { service, accountReads, client, ...view };
}

it('guards cold page chunks, keeps the pending shell usable and discards protected content after logout', async () => {
  const anonymous = await start('/admin/accounts');
  await screen.findByRole('heading', { name: '로그인' });
  expect(gate.loads).toBe(0);
  anonymous.unmount();
  const wrongRole = await start('/admin/accounts', 'doctor');
  await screen.findByRole('heading', { name: '403' });
  expect(gate.loads).toBe(0);
  wrongRole.unmount();
  const { accountReads, client, unmount } = await start(
    '/admin/accounts',
    'admin',
  );
  await screen.findByRole('navigation', { name: '주 메뉴' });
  expect(screen.getByRole('status').textContent).toBe('불러오는 중입니다.');
  expect(screen.queryByRole('heading', { name: '계정 관리' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
  await screen.findByRole('heading', { name: '로그인' });
  await act(async () => {
    gate.release();
    await vi.dynamicImportSettled();
  });
  expect(gate.loads).toBe(1);
  expect(accountReads).not.toHaveBeenCalled();
  expect(client.getQueryCache().getAll()).toEqual([]);
  expect(screen.queryByRole('heading', { name: '계정 관리' })).toBeNull();
  unmount();
  await start('/admin/accounts', 'admin');
  await screen.findByRole('heading', { name: '계정 관리' });
  await screen.findByRole('table', { name: '계정 목록' });
  expect(screen.getByRole('button', { name: '로그아웃' })).toBeTruthy();
});
it('uses the existing app error boundary if a page chunk fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await start('/nurse/patients', 'nurse');
  await screen.findByRole('heading', { name: '화면을 불러올 수 없습니다.' });
  expect(screen.getByRole('button', { name: '새로고침' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: '접수 환자 현황' })).toBeNull();
});
