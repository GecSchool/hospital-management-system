import type {
  AdminService,
  AccountInvitation,
  AccountFilters,
} from '../../features/admin/service';
import type { DepartmentSummary } from '../../types/auth';
import { roles } from '../../types/auth';
import type { Principal } from '../../features/nurse/service';
import type { PageRequest } from '../../features/staff/types';
import { businessDate } from '../../features/staff/format';
import { ApiError } from '../api/errors';
import type { MockAccountStore } from './accounts';

/** DEVELOPMENT ONLY. All decisions read the existing central repositories, no business copies. */
export function createMockAdminService(
  source: {
    accounts: MockAccountStore;
    departments(): readonly DepartmentSummary[];
    doctorHasPendingWork(doctorId: string, today: string): boolean;
    wait(signal?: AbortSignal, saving?: boolean): Promise<void>;
  },
  principal: Principal,
): AdminService {
  const forbidden = () => {
    throw new ApiError('FORBIDDEN', '관리자만 이용할 수 있습니다.', 403);
  };
  async function auth() {
    const u = await principal();
    if (!u) throw new ApiError('UNAUTHENTICATED', '로그인이 필요합니다.', 401);
    if (u.role !== 'ADMIN' || u.status !== 'ACTIVE') return forbidden();
    const account = source.accounts.all().find((a) => a.id === u.id);
    if (!account || account.status !== 'ACTIVE' || account.role !== 'ADMIN')
      return forbidden();
    return account;
  }
  async function ready(signal?: AbortSignal, saving = false) {
    const u = await auth();
    const epoch = source.accounts.epoch(u.id);
    await source.wait(signal, saving);
    const after = await auth();
    if (u.id !== after.id || epoch !== source.accounts.epoch(u.id))
      return forbidden();
    return after;
  }
  function validPage(page: PageRequest) {
    if (![page.page, page.size].every((n) => Number.isInteger(n) && n > 0))
      throw new ApiError(
        'VALIDATION_ERROR',
        '페이지 정보를 확인해 주세요.',
        400,
      );
  }
  function validate(input: AccountInvitation) {
    if (
      !input.name?.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
      !roles.includes(input.role)
    )
      throw new ApiError(
        'VALIDATION_ERROR',
        '이름·이메일·역할을 확인해 주세요.',
        400,
      );
    if (['DOCTOR', 'NURSE'].includes(input.role)) {
      const dep = source
        .departments()
        .find((d) => d.id === input.departmentId && d.status === 'ACTIVE');
      if (!dep)
        throw new ApiError(
          'VALIDATION_ERROR',
          '활성 진료과를 선택해 주세요.',
          400,
        );
      return dep;
    }
    if (input.departmentId != null && input.departmentId !== '')
      throw new ApiError(
        'VALIDATION_ERROR',
        '직원·관리자는 소속 진료과를 입력하지 않습니다.',
        400,
      );
    return null;
  }
  return {
    mock: true,
    async dashboard(signal) {
      await ready(signal);
      const accountsByRole = { STAFF: 0, DOCTOR: 0, NURSE: 0, ADMIN: 0 };
      const departmentsByStatus = { ACTIVE: 0, INACTIVE: 0 };
      source.accounts
        .all()
        .filter((a) => a.status === 'ACTIVE')
        .forEach((a) => accountsByRole[a.role]++);
      source.departments().forEach((d) => departmentsByStatus[d.status]++);
      return { accountsByRole, departmentsByStatus };
    },
    async list(filters: AccountFilters, page, signal) {
      await ready(signal);
      validPage(page);
      if (
        (filters.role && !roles.includes(filters.role)) ||
        (filters.status && !['ACTIVE', 'INACTIVE'].includes(filters.status))
      )
        throw new ApiError(
          'VALIDATION_ERROR',
          '검색 조건을 확인해 주세요.',
          400,
        );
      const rows = source.accounts
        .all()
        .filter(
          (a) =>
            (!filters.name || a.name.includes(filters.name)) &&
            (!filters.email ||
              a.email.toLowerCase().includes(filters.email.toLowerCase())) &&
            (!filters.role || a.role === filters.role) &&
            (!filters.status || a.status === filters.status),
        );
      return {
        data: rows.slice((page.page - 1) * page.size, page.page * page.size),
        meta: {
          ...page,
          totalItems: rows.length,
          totalPages: Math.ceil(rows.length / page.size),
        },
      };
    },
    async detail(id, signal) {
      await ready(signal);
      return source.accounts.get(id);
    },
    async departments(signal) {
      await ready(signal);
      return structuredClone(
        source.departments().filter((d) => d.status === 'ACTIVE'),
      );
    },
    async invite(input) {
      await ready(undefined, true);
      const department = validate(input);
      source.accounts.invite(
        { ...input, name: input.name.trim(), email: input.email.trim() },
        department,
      );
      return {
        message:
          '개발용 Mock 초대 요청을 등록했습니다. 실제 이메일은 발송되지 않았으며 수락 전 계정은 생성되지 않습니다.',
      };
    },
    async changeStatus(id, status) {
      await ready(undefined, true);
      if (!['ACTIVE', 'INACTIVE'].includes(status))
        throw new ApiError('VALIDATION_ERROR', '상태를 확인해 주세요.', 400);
      const account = source.accounts.get(id);
      if (account.status === 'ACTIVE' && status === 'INACTIVE') {
        if (
          account.role === 'ADMIN' &&
          source.accounts
            .all()
            .filter((a) => a.role === 'ADMIN' && a.status === 'ACTIVE')
            .length <= 1
        )
          throw new ApiError(
            'LAST_ACTIVE_ADMIN',
            '마지막 활성 관리자 계정은 비활성화할 수 없습니다.',
            409,
          );
        if (
          account.role === 'DOCTOR' &&
          account.doctorId &&
          source.doctorHasPendingWork(account.doctorId, businessDate())
        )
          throw new ApiError(
            'DOCTOR_HAS_PENDING_WORK',
            '처리되지 않은 예약·접수·진료가 있어 비활성화할 수 없습니다.',
            409,
          );
      }
      return source.accounts.setStatus(id, status);
    },
    async requestPasswordReset(id) {
      await ready(undefined, true);
      source.accounts.reset(id);
      return {
        message:
          '개발용 Mock 재설정 요청을 등록했습니다. 실제 이메일은 발송되지 않았으며 계정 상태는 유지됩니다.',
      };
    },
  };
}
