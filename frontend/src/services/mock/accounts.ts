import type { DepartmentSummary, SelfAccount } from '../../types/auth';
import type {
  AccountInvitation,
  AccountStatus,
} from '../../features/admin/service';
import type {
  AuthLinkKind,
  InvitationInfo,
  PasswordSubmission,
} from '../../features/auth/authService';
import { ApiError } from '../api/errors';
import { mockAccounts, mockUsernames } from './identity';

/** DEVELOPMENT ONLY. Auth and Admin use this one account repository, never browser storage.
 * The unchanged role fixtures seed each repository once; admin does not keep a second copy.
 * No submitted password is retained. Managed links are local, one-time mock state only.
 */
export function createMockAccountStore(
  seed: readonly SelfAccount[] = Object.values(mockAccounts),
) {
  const accounts = new Map(seed.map((a) => [a.id, structuredClone(a)]));
  const epochs = new Map<string, number>();
  const listeners = new Set<(accountId: string) => void>();
  const changes = new Set<(accountId: string) => void>();
  const changedScopes = new Set<string>();
  let departmentLookup:
    ((id: string) => DepartmentSummary | undefined) | undefined;
  const invitations = new Map<
    string,
    { info: InvitationInfo; consumed: boolean }
  >();
  const resets = new Map<string, { accountId: string; consumed: boolean }>();
  let sequence = 0;
  let latestInvitation: string | undefined;
  let latestReset: string | undefined;
  const clone = <T>(v: T): T => structuredClone(v);
  const invalid = () => {
    throw new ApiError('LINK_EXPIRED', '링크를 사용할 수 없습니다.', 410);
  };
  function get(id: string) {
    const a = accounts.get(id);
    if (!a) throw new ApiError('NOT_FOUND', '계정을 찾을 수 없습니다.', 404);
    return a;
  }
  function revoke(id: string) {
    epochs.set(id, (epochs.get(id) ?? 0) + 1);
    listeners.forEach((listener) => listener(id));
  }
  return {
    all: () => [...accounts.values()].map(clone),
    get: (id: string) => clone(get(id)),
    username(identifier: string) {
      const role = (
        Object.keys(mockUsernames) as (keyof typeof mockUsernames)[]
      ).find((role) => mockUsernames[role] === identifier);
      return role ? clone(get(mockAccounts[role].id)) : undefined;
    },
    epoch: (id: string) => epochs.get(id) ?? 0,
    subscribe(listener: (accountId: string) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    subscribeChanges(listener: (accountId: string) => void) {
      changes.add(listener);
      return () => {
        changes.delete(listener);
      };
    },
    configureDepartments(
      lookup: (id: string) => DepartmentSummary | undefined,
    ) {
      departmentLookup = lookup;
    },
    resolvePrincipal(input: SelfAccount | null) {
      if (!input) return null;
      const actual = accounts.get(input.id);
      // Refresh authoritative scope metadata after department changes.
      // Status revocation continues to belong to the existing auth session boundary.
      return actual && changedScopes.has(input.id) ? clone(actual) : input;
    },
    refreshDepartment(department: DepartmentSummary) {
      for (const [id, a] of accounts)
        if (a.department?.id === department.id) {
          accounts.set(id, { ...a, department: clone(department) });
          changedScopes.add(id);
          changes.forEach((listener) => listener(id));
        }
    },
    setDepartment(id: string, department: DepartmentSummary) {
      const a = get(id);
      accounts.set(id, { ...a, department: clone(department) });
      changedScopes.add(id);
      changes.forEach((listener) => listener(id));
      return clone(get(id));
    },
    setStatus(id: string, status: AccountStatus) {
      const a = get(id);
      if (a.status !== status) {
        accounts.set(id, { ...a, status });
        if (status === 'INACTIVE') revoke(id);
      }
      return clone(get(id));
    },
    invite(input: AccountInvitation, department: DepartmentSummary | null) {
      latestInvitation = `demo-managed-invitation-${++sequence}`;
      invitations.set(latestInvitation, {
        info: {
          name: input.name,
          email: input.email,
          role: input.role,
          department: clone(department),
        },
        consumed: false,
      });
    },
    reset(id: string) {
      get(id);
      latestReset = `demo-managed-reset-${++sequence}`;
      resets.set(latestReset, { accountId: id, consumed: false });
    },
    latestToken(kind: AuthLinkKind) {
      return kind === 'invitation' ? latestInvitation : latestReset;
    },
    managed(token: string) {
      return token.startsWith('demo-managed-');
    },
    verifyInvitation(token: string) {
      const link = invitations.get(token);
      if (!link || link.consumed) return invalid();
      const info = clone(link.info);
      if (info.department && departmentLookup)
        info.department = clone(
          departmentLookup(info.department.id) ?? info.department,
        );
      return info;
    },
    verifyReset(token: string) {
      const link = resets.get(token);
      if (!link || link.consumed) return invalid();
      get(link.accountId);
    },
    complete(kind: AuthLinkKind, input: PasswordSubmission) {
      if (!input.password || input.password !== input.passwordConfirm)
        throw new ApiError(
          'VALIDATION_ERROR',
          '비밀번호와 확인 값을 확인해 주세요.',
          400,
        );
      if (kind === 'invitation') {
        const link = invitations.get(input.token);
        if (!link || link.consumed) return invalid();
        // Only acceptance creates a synthetic account. No credential or email is persisted externally.
        const id = `demo-invited-account-${++sequence}`;
        const info = link.info;
        if (info.department && departmentLookup) {
          const currentDepartment = departmentLookup(info.department.id);
          if (!currentDepartment || currentDepartment.status !== 'ACTIVE')
            return invalid();
          info.department = clone(currentDepartment);
        }
        const account: SelfAccount =
          info.role === 'DOCTOR'
            ? {
                ...info,
                id,
                status: 'ACTIVE',
                role: 'DOCTOR',
                doctorId: `demo-invited-doctor-${sequence}`,
              }
            : {
                ...info,
                id,
                status: 'ACTIVE',
                role: info.role,
                doctorId: null,
              };
        accounts.set(id, account);
        link.consumed = true;
      } else {
        const link = resets.get(input.token);
        if (!link || link.consumed) return invalid();
        get(link.accountId);
        link.consumed = true;
        revoke(link.accountId);
      }
    },
  };
}
export type MockAccountStore = ReturnType<typeof createMockAccountStore>;
// The two existing booking-only doctor profiles now have accounts in the same Map.
// They have no additional login credentials. Existing four role fixtures are unchanged.
export const mockAccountStore = createMockAccountStore([
  ...Object.values(mockAccounts),
  ...[2, 3].map((n): SelfAccount => ({
    id: `demo-doctor-account-${n}`,
    doctorId: `demo-doctor-${n}`,
    name: `가상의사${n}`,
    email: `doctor${n}@example.test`,
    role: 'DOCTOR',
    status: 'ACTIVE',
    department:
      n === 2
        ? { id: 'demo-pediatric', name: '소아청소년과', status: 'ACTIVE' }
        : { id: 'demo-internal', name: '내과', status: 'ACTIVE' },
  })),
]);
