import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '../../app/providers/AppProviders';
import { createQueryClient } from '../../app/providers/queryClient';
import { AppRoutes } from '../../app/router/routes';
import { createMockAuthService } from '../../services/mock/auth';
import { createMockStaffService } from '../../services/mock/staff';
import { ApiError } from '../../services/api/errors';
import {
  advanceSessionGeneration,
  getSessionGeneration,
} from '../../services/api/sessionGeneration';
import type { Role } from '../../types/auth';
import { refreshPatient, staffKeys } from './queries';

vi.mock('../../services/mode', () => ({ apiMode: 'mock' }));

function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location">
        {location.pathname + location.search}
      </output>
      <button onClick={() => navigate(-1)}>test back</button>
      <button onClick={() => navigate('/unknown-screen')}>test leave</button>
    </>
  );
}
async function start(
  path = '/staff/patients',
  service = createMockStaffService({ latencyMs: 0 }),
  role: Role = 'STAFF',
) {
  const auth = createMockAuthService({ latencyMs: 0 });
  await auth.login({ identifier: role.toLowerCase(), password: '1234' });
  const client = createQueryClient();
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders service={auth} client={client}>
        <AppRoutes staffService={service} />
        <Probe />
      </AppProviders>
    </MemoryRouter>,
  );
  return { service, client, auth };
}
async function listReady() {
  await screen.findByRole('link', { name: '가상환자001 상세 보기' });
}
async function openRegistration() {
  await screen.findByRole('button', { name: '+ 환자 등록' });
  fireEvent.click(screen.getByRole('button', { name: '+ 환자 등록' }));
  return screen.getByRole('dialog', { name: '환자 등록' });
}
function fillRegistration(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText('이름'), {
    target: { value: '가상신규환자' },
  });
  fireEvent.change(within(dialog).getByLabelText('주민등록번호'), {
    target: { value: '900101-0000000' },
  });
  fireEvent.change(within(dialog).getByLabelText('연락처'), {
    target: { value: '010-0000-9999' },
  });
}

describe('staff dashboard', () => {
  it('renders only the visible reception and appointment previews with routes for future work', async () => {
    await start('/staff');
    const receptions = await screen.findByRole('table', {
      name: '당일 접수 현황',
    });
    expect(within(receptions).getAllByRole('row')).toHaveLength(5);
    expect(within(receptions).getAllByText('현장 접수')).toHaveLength(2);
    expect(screen.getByRole('table', { name: '오늘 예약 환자' })).toBeTruthy();
    expect(screen.queryByText('진료 완료 요약')).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: '예약 등록' }));
    await screen.findByRole('heading', { name: '환자 목록' });
    expect(screen.getByTestId('location').textContent).toBe('/staff/patients');
  });
  it.each([
    ['접수 현황 전체 보기', '예약·접수 현황'],
    ['예약 목록 전체 보기', '예약·접수 현황'],
  ])('reuses the existing placeholder for %s', async (link, heading) => {
    await start('/staff');
    await screen.findByRole('link', { name: link });
    fireEvent.click(screen.getByRole('link', { name: link }));
    await screen.findByRole('heading', { name: heading });
    expect(
      await screen.findByRole('table', {
        name: link === '접수 현황 전체 보기' ? '접수 현황' : '전체 예약',
      }),
    ).toBeTruthy();
  });
  it('shows empty previews rather than fabricated summary totals', async () => {
    const service = createMockStaffService({ latencyMs: 0, count: 0 });
    await start('/staff', service);
    await screen.findByText('당일 접수 내역이 없습니다.');
    expect(screen.getByText('오늘 예약 내역이 없습니다.')).toBeTruthy();
  });
  it('shows loading and allows an explicit retry after a server error', async () => {
    const service = createMockStaffService({ latencyMs: 0 });
    service.dashboard = vi
      .fn(service.dashboard)
      .mockRejectedValueOnce(new ApiError('SERVER_ERROR', '서버 오류', 500));
    await start('/staff', service);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await screen.findByRole('table', { name: '당일 접수 현황' });
    expect(service.dashboard).toHaveBeenCalledTimes(2);
  });
});

describe('patient list and registration', () => {
  it('loads paginated patients and restores a page through browser back', async () => {
    await start();
    await listReady();
    expect(screen.getByText('총 25명')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '2페이지' }));
    await screen.findByRole('link', { name: '가상환자006 상세 보기' });
    expect(screen.getByTestId('location').textContent).toBe(
      '/staff/patients?page=2',
    );
    fireEvent.click(screen.getByRole('button', { name: 'test back' }));
    await listReady();
  });
  it('combines search criteria, resets to page 1, and keeps PII out of URL and query keys', async () => {
    const { client } = await start('/staff/patients?page=3');
    await screen.findByRole('link', { name: '가상환자011 상세 보기' });
    fireEvent.change(screen.getByLabelText('이름'), {
      target: { value: '가상환자001' },
    });
    fireEvent.change(screen.getByLabelText('생년월일'), {
      target: { value: '1985.03.14' },
    });
    fireEvent.change(screen.getByLabelText('연락처'), {
      target: { value: '010-0000-0001' },
    });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));
    await listReady();
    expect(screen.getByText('총 1명')).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe(
      '/staff/patients?page=1',
    );
    const keys = JSON.stringify(
      client
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    );
    for (const sensitive of ['가상환자001', '1985-03-14', '010-0000-0001'])
      expect(keys).not.toContain(sensitive);
  });
  it('shows no search results and validates impossible birth dates', async () => {
    const { service } = await start();
    service.list = vi.fn(service.list);
    await listReady();
    fireEvent.change(screen.getByLabelText('생년월일'), {
      target: { value: '2026.02.31' },
    });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));
    expect(screen.getByRole('alert').textContent).toContain('생년월일');
    fireEvent.change(screen.getByLabelText('생년월일'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('이름'), {
      target: { value: '없는가상환자' },
    });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));
    await screen.findByText('검색 결과가 없습니다.');
    expect(screen.getByText('총 0명')).toBeTruthy();
  });
  it('validates required fields and formatting before any registration request', async () => {
    const { service } = await start();
    service.create = vi.fn(service.create);
    const dialog = await openRegistration();
    fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
    expect(within(dialog).getAllByRole('alert')).toHaveLength(3);
    expect(service.create).not.toHaveBeenCalled();
    fillRegistration(dialog);
    fireEvent.change(within(dialog).getByLabelText('주민등록번호'), {
      target: { value: '850314-•••••••' },
    });
    fireEvent.change(within(dialog).getByLabelText('연락처'), {
      target: { value: 'not-a-phone' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
    expect(within(dialog).getAllByRole('alert')).toHaveLength(2);
    expect(service.create).not.toHaveBeenCalled();
  });
  it('registers a synthetic patient, refreshes the list, and exposes only the masked identity', async () => {
    const { client } = await start();
    await listReady();
    const dialog = await openRegistration();
    fillRegistration(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
    await screen.findByRole('link', { name: '가상신규환자 상세 보기' });
    expect(screen.getByText('총 26명')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain('900101-0000000');
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    fireEvent.click(
      screen.getByRole('link', { name: '등록한 환자 상세 보기' }),
    );
    await screen.findByRole('heading', { name: '가상신규환자' });
    expect(screen.getByText('900101-•••••••')).toBeTruthy();
    await screen.findByText('예약 이력이 없습니다.');
  });
  it('clears registration draft after cancel and reopening', async () => {
    await start();
    let dialog = await openRegistration();
    fillRegistration(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    dialog = await openRegistration();
    for (const label of ['이름', '주민등록번호', '연락처'])
      expect(
        (within(dialog).getByLabelText(label) as HTMLInputElement).value,
      ).toBe('');
  });
  it('shows save failure, clears the sensitive input and allows recovery', async () => {
    const { service } = await start();
    service.create = vi
      .fn(service.create)
      .mockRejectedValueOnce(
        new ApiError('SERVER_ERROR', '등록에 실패했습니다.', 500),
      );
    const dialog = await openRegistration();
    fillRegistration(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
    await within(dialog).findByRole('alert');
    expect(
      (within(dialog).getByLabelText('주민등록번호') as HTMLInputElement).value,
    ).toBe('');
    fillRegistration(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
    await screen.findByRole('link', { name: '가상신규환자 상세 보기' });
  });
  it('blocks duplicate registration and prevents closing while pending', async () => {
    const { service } = await start();
    const create = service.create;
    let release!: () => void;
    service.create = vi.fn(async (input) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return create(input);
    });
    const dialog = await openRegistration();
    fillRegistration(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
    expect(
      within(dialog)
        .getByRole('button', { name: '취소' })
        .hasAttribute('disabled'),
    ).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: '저장 중…' }));
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(service.create).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeTruthy();
    await act(async () => release());
    await screen.findByRole('link', { name: '가상신규환자 상세 보기' });
  });
});

describe('patient detail and histories', () => {
  it('opens a patient from page 2 and returns to the same list page', async () => {
    await start('/staff/patients?page=2');
    fireEvent.click(
      await screen.findByRole('link', { name: '가상환자006 상세 보기' }),
    );
    await screen.findByRole('heading', { name: '가상환자006' });
    fireEvent.click(screen.getByRole('link', { name: '환자 목록' }));
    await screen.findByRole('link', { name: '가상환자006 상세 보기' });
    expect(screen.getByTestId('location').textContent).toBe(
      '/staff/patients?page=2',
    );
  });
  it('updates name and phone consistently in detail, list and cached histories without resending a masked identity', async () => {
    const { service } = await start();
    service.update = vi.fn(service.update);
    await listReady();
    fireEvent.click(
      screen.getByRole('link', { name: '가상환자001 상세 보기' }),
    );
    await screen.findByRole('heading', { name: '가상환자001' });
    await screen.findByRole('table', { name: '예약 이력' });
    fireEvent.click(screen.getByRole('button', { name: '정보 수정' }));
    const dialog = screen.getByRole('dialog', { name: '환자 정보 수정' });
    expect(
      (within(dialog).getByLabelText('주민등록번호') as HTMLInputElement)
        .readOnly,
    ).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('이름'), {
      target: { value: '가상수정환자' },
    });
    fireEvent.change(within(dialog).getByLabelText('연락처'), {
      target: { value: '010-0000-8888' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    await screen.findByRole('heading', { name: '가상수정환자' });
    expect(service.update).toHaveBeenCalledWith('demo-patient', {
      name: '가상수정환자',
      phone: '010-0000-8888',
    });
    const history = await screen.findByRole('table', { name: '예약 이력' });
    await waitFor(() =>
      expect(within(history).getAllByText('가상수정환자')).toHaveLength(3),
    );
    fireEvent.click(screen.getByRole('link', { name: '환자 목록' }));
    await screen.findByRole('link', { name: '가상수정환자 상세 보기' });
    expect(screen.getByText('010-0000-8888')).toBeTruthy();
  });
  it('cancels edits and resets the draft on reopening', async () => {
    await start('/staff/patients/demo-patient');
    await screen.findByRole('heading', { name: '가상환자001' });
    fireEvent.click(screen.getByRole('button', { name: '정보 수정' }));
    let dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('이름'), {
      target: { value: '버릴가상값' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    fireEvent.click(screen.getByRole('button', { name: '정보 수정' }));
    dialog = screen.getByRole('dialog');
    expect(
      (within(dialog).getByLabelText('이름') as HTMLInputElement).value,
    ).toBe('가상환자001');
    expect(
      within(dialog)
        .getByRole('button', { name: '저장' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });
  it('loads only the selected history and never renders clinical record contents', async () => {
    const service = createMockStaffService({ latencyMs: 0 });
    service.receptions = vi.fn(service.receptions);
    service.visits = vi.fn(service.visits);
    await start('/staff/patients/demo-patient', service);
    await screen.findByRole('table', { name: '예약 이력' });
    expect(service.receptions).not.toHaveBeenCalled();
    expect(service.visits).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: '접수 이력' }));
    await screen.findByRole('table', { name: '접수 이력' });
    expect(screen.getByTestId('location').textContent).toContain(
      'tab=receptions',
    );
    fireEvent.keyDown(screen.getByRole('tab', { name: '접수 이력' }), {
      key: 'ArrowRight',
    });
    const visits = await screen.findByRole('table', { name: '진료 이력' });
    expect(within(visits).getAllByText('진료 완료')).toHaveLength(2);
    for (const forbidden of ['진단', '증상', '의사 소견', '간호 기록'])
      expect(within(visits).queryByText(forbidden)).toBeNull();
  });
  it('shows a safe missing-patient error with a route back to the list', async () => {
    await start('/staff/patients/absent');
    expect((await screen.findByRole('alert')).textContent).toContain(
      '환자 정보를 찾을 수 없습니다.',
    );
    fireEvent.click(screen.getByRole('link', { name: '환자 목록' }));
    await listReady();
  });
  it.each(['DOCTOR', 'NURSE', 'ADMIN'] as const)(
    'denies %s before any staff API is called',
    async (role) => {
      const service = createMockStaffService({ latencyMs: 0 });
      service.detail = vi.fn(service.detail);
      service.dashboard = vi.fn(service.dashboard);
      service.list = vi.fn(service.list);
      await start('/staff/patients/demo-patient', service, role);
      await screen.findByRole('heading', { name: '403' });
      expect(service.detail).not.toHaveBeenCalled();
      expect(service.dashboard).not.toHaveBeenCalled();
      expect(service.list).not.toHaveBeenCalled();
    },
  );
  it('does not repopulate private cache when session generation changes during mutation refresh', async () => {
    const client = createQueryClient();
    const service = createMockStaffService({ latencyMs: 0 });
    const patient = await service.detail('demo-patient');
    const generation = getSessionGeneration();
    let release!: () => void;
    vi.spyOn(client, 'cancelQueries').mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const pending = refreshPatient(
      client,
      'old-account',
      patient,
      () => generation === getSessionGeneration(),
    );
    advanceSessionGeneration();
    release();
    await pending;
    expect(
      client.getQueryData(staffKeys.detail('old-account', patient.id)),
    ).toBeUndefined();
  });
});

it('recovers from a detail Mock server error through the visible scenario control', async () => {
  await start('/staff/patients/demo-patient');
  await screen.findByRole('heading', { name: '가상환자001' });
  fireEvent.click(
    screen.getByText('개발용 Mock · 모든 환자 정보는 가상 데이터입니다.'),
  );
  fireEvent.change(screen.getByLabelText('응답 시나리오'), {
    target: { value: 'error' },
  });
  await screen.findByRole('alert');
  fireEvent.click(
    screen.getByText('개발용 Mock · 모든 환자 정보는 가상 데이터입니다.'),
  );
  fireEvent.change(screen.getByLabelText('응답 시나리오'), {
    target: { value: 'normal' },
  });
  await screen.findByRole('heading', { name: '가상환자001' });
});

it('shows a loading state until the patient list request resolves', async () => {
  const service = createMockStaffService({ latencyMs: 0 });
  const list = service.list;
  let release!: () => void;
  service.list = async (...args) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return list(...args);
  };
  await start('/staff/patients', service);
  await screen.findByText('환자 목록을 불러오고 있습니다.');
  expect(screen.queryByRole('table', { name: '환자 목록' })).toBeNull();
  await act(async () => release());
  await listReady();
});

it('keeps the original patient data after a failed edit and allows retry', async () => {
  const service = createMockStaffService({ latencyMs: 0 });
  service.update = vi
    .fn(service.update)
    .mockRejectedValueOnce(new ApiError('SERVER_ERROR', '저장 오류', 500));
  await start('/staff/patients/demo-patient', service);
  await screen.findByRole('heading', { name: '가상환자001' });
  fireEvent.click(screen.getByRole('button', { name: '정보 수정' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('이름'), {
    target: { value: '가상재시도환자' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
  await within(dialog).findByRole('alert');
  expect((await service.detail('demo-patient')).name).toBe('가상환자001');
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
  await screen.findByRole('heading', { name: '가상재시도환자' });
});
