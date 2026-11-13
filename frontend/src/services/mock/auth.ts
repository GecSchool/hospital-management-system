import type {
  AuthLinkKind,
  AuthService,
  InvitationInfo,
  PasswordSubmission,
} from '../../features/auth/authService';
import { ApiError } from '../api/errors';
import type { Role, SelfAccount } from '../../types/auth';

import { mockAccounts, mockUsernames, mockPassword } from './identity';
export { mockAccounts, mockUsernames, mockPassword } from './identity';
import { mockAccountStore, type MockAccountStore } from './accounts';

const linkScenarios = [
  'doctor',
  'admin',
  'staff',
  'nurse',
  'expired',
  'server-error',
  'submit-error',
  'expires-on-submit',
] as const;
const loginScenarios = [
  { identifier: 'inactive', label: '비활성 계정' },
  { identifier: 'server-error', label: '서버 오류' },
  { identifier: 'rate-limited', label: '요청 제한' },
];
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    function abort() {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export function createMockAuthService({
  latencyMs = 150,
  accounts = mockAccountStore,
}: { latencyMs?: number; accounts?: MockAccountStore } = {}): AuthService {
  let current: SelfAccount | null = null;
  let currentEpoch = 0;
  const consumed = new Set<string>();
  function scenarioFor(kind: AuthLinkKind, token: string) {
    const prefix = `demo-${kind}-`;
    const scenario = token.startsWith(prefix) ? token.slice(prefix.length) : '';
    if (
      !linkScenarios.includes(scenario as (typeof linkScenarios)[number]) ||
      scenario === 'expired' ||
      consumed.has(token)
    ) {
      throw new ApiError(
        kind === 'invitation' ? 'INVITATION_INVALID' : 'RESET_LINK_INVALID',
        '링크를 사용할 수 없습니다.',
        410,
      );
    }
    if (scenario === 'server-error')
      throw new ApiError('SERVER_ERROR', '개발용 서버 오류 시뮬레이션', 500);
    return scenario;
  }
  function complete(kind: AuthLinkKind, input: PasswordSubmission) {
    if (accounts.managed(input.token)) {
      accounts.complete(kind, input);
      current = null;
      return;
    }
    const scenario = scenarioFor(kind, input.token);
    if (scenario === 'expires-on-submit')
      throw new ApiError('LINK_EXPIRED', '링크가 만료되었습니다.', 410);
    if (scenario === 'submit-error')
      throw new ApiError('SERVER_ERROR', '개발용 저장 오류 시뮬레이션', 500);
    if (!input.password)
      throw new ApiError('PASSWORD_REQUIRED', '비밀번호를 입력해 주세요.', 400);
    if (input.password !== input.passwordConfirm)
      throw new ApiError(
        'PASSWORD_MISMATCH',
        '비밀번호가 일치하지 않습니다.',
        422,
      );
    // Simulate one-time consumption only. Never store the submitted password or create a real account.
    consumed.add(input.token);
    current = null;
  }
  return {
    onAccountChanged(listener) {
      return accounts.subscribeChanges((id) => {
        if (current?.id === id) {
          current = accounts.get(id);
          listener(structuredClone(current));
        }
      });
    },
    onSessionInvalidated(listener) {
      return accounts.subscribe((id) => {
        if (current?.id === id) {
          current = null;
          listener();
        }
      });
    },
    loginIdentifier: 'username',
    developmentLogin: {
      identifiers: Object.values(mockUsernames),
      password: mockPassword,
      scenarios: loginScenarios,
    },
    get developmentLinks() {
      return (['invitation', 'reset'] as const).flatMap((kind) =>
        [
          ...linkScenarios,
          ...(accounts.latestToken(kind) ? ['managed'] : []),
        ].map((scenario) => ({
          kind,
          scenario,
          label: `${kind === 'invitation' ? '초대' : '재설정'} · ${scenario === 'managed' ? '최근 관리자 Mock 요청' : scenario}`,
        })),
      );
    },
    developmentToken(kind, scenario) {
      if (scenario === 'managed') return accounts.latestToken(kind);
      return linkScenarios.includes(scenario as (typeof linkScenarios)[number])
        ? `demo-${kind}-${scenario}`
        : undefined;
    },
    async me(signal) {
      await wait(latencyMs, signal);
      if (
        current &&
        (accounts.get(current.id).status !== 'ACTIVE' ||
          currentEpoch !== accounts.epoch(current.id))
      )
        current = null;
      return current ? accounts.get(current.id) : null;
    },
    async login({ identifier, password }) {
      await wait(latencyMs);
      if (password === mockPassword) {
        if (identifier === 'inactive')
          throw new ApiError('ACCOUNT_INACTIVE', '비활성 계정입니다.', 403);
        if (identifier === 'server-error')
          throw new ApiError(
            'SERVER_ERROR',
            '개발용 서버 오류 시뮬레이션',
            500,
          );
        if (identifier === 'rate-limited')
          throw new ApiError('RATE_LIMITED', '요청 제한', 429);
      }
      const account = accounts.username(identifier);
      if (!account || password !== mockPassword)
        throw new ApiError(
          'INVALID_CREDENTIALS',
          '아이디 또는 비밀번호가 올바르지 않습니다.',
          401,
        );
      if (account.status !== 'ACTIVE')
        throw new ApiError('ACCOUNT_INACTIVE', '비활성 계정입니다.', 403);
      current = structuredClone(account);
      currentEpoch = accounts.epoch(account.id);
      return structuredClone(current);
    },
    async logout() {
      await wait(latencyMs);
      current = null;
    },
    async verifyInvitation(token, signal) {
      await wait(latencyMs, signal);
      if (accounts.managed(token)) return accounts.verifyInvitation(token);
      const scenario = scenarioFor('invitation', token);
      const role = (
        ['doctor', 'admin', 'staff', 'nurse'].includes(scenario)
          ? scenario.toUpperCase()
          : 'DOCTOR'
      ) as Role;
      const account = mockAccounts[role];
      const info: InvitationInfo = {
        name: account.name,
        email: account.email,
        role,
        department: account.department,
      };
      return structuredClone(info);
    },
    async acceptInvitation(input) {
      await wait(latencyMs);
      complete('invitation', input);
    },
    async verifyPasswordReset(token, signal) {
      await wait(latencyMs, signal);
      if (accounts.managed(token)) {
        accounts.verifyReset(token);
        return;
      }
      scenarioFor('reset', token);
    },
    async confirmPasswordReset(input) {
      await wait(latencyMs);
      complete('reset', input);
    },
  };
}
