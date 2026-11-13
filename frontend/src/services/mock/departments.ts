import type { DepartmentService } from '../../features/admin/departmentService';
import type { DepartmentSummary } from '../../types/auth';
import { roles } from '../../types/auth';
import type { Principal } from '../../features/nurse/service';
import { ApiError } from '../api/errors';
import { businessDate } from '../../features/staff/format';
import type { MockAccountStore } from './accounts';

/** DEVELOPMENT ONLY. Mutates the existing booking department array and account Map. */
export function createMockDepartments(
  source: {
    accounts: MockAccountStore;
    departments: DepartmentSummary[];
    referenced(id: string): boolean;
    doctorHasPendingWork(id: string, today: string): boolean;
    syncDoctors(): void;
    wait(signal?: AbortSignal, saving?: boolean): Promise<void>;
  },
  principal: Principal,
): DepartmentService {
  let sequence = 0;
  const fail = (code: string, message: string, status = 409): never => {
    throw new ApiError(code, message, status);
  };
  const get = (id: string) =>
    source.departments.find((d) => d.id === id) ??
    fail('NOT_FOUND', '진료과를 찾을 수 없습니다.', 404);
  async function auth(kind: 'admin' | 'doctors' | 'common') {
    const given = await principal();
    const u = source.accounts.resolvePrincipal(given);
    if (!u) return fail('UNAUTHENTICATED', '로그인이 필요합니다.', 401);
    if (
      u.status !== 'ACTIVE' ||
      (kind === 'admin' && u.role !== 'ADMIN') ||
      (kind === 'doctors' && !['ADMIN', 'STAFF', 'NURSE'].includes(u.role))
    )
      return fail('FORBIDDEN', '진료과 접근 권한이 없습니다.', 403);
    if (
      u.role === 'ADMIN' &&
      !source.accounts
        .all()
        .some(
          (a) => a.id === u.id && a.role === 'ADMIN' && a.status === 'ACTIVE',
        )
    )
      return fail('FORBIDDEN', '관리자 권한이 없습니다.', 403);
    return u;
  }
  async function ready(
    kind: 'admin' | 'doctors' | 'common',
    signal?: AbortSignal,
    saving = false,
  ) {
    const u = await auth(kind);
    const epoch = source.accounts.epoch(u.id);
    await source.wait(signal, saving);
    const after = await auth(kind);
    if (
      u.id !== after.id ||
      u.role !== after.role ||
      u.department?.id !== after.department?.id ||
      epoch !== source.accounts.epoch(u.id)
    )
      return fail('FORBIDDEN', '세션이 변경되었습니다.', 403);
    return after;
  }
  function nameFor(name: string, except?: string) {
    if (typeof name !== 'string' || !name.trim())
      return fail('VALIDATION_ERROR', '진료과명을 입력해 주세요.', 400);
    const value = name.trim();
    if (source.departments.some((d) => d.id !== except && d.name === value))
      return fail('DEPARTMENT_NAME_DUPLICATE', '이미 등록된 진료과명입니다.');
    return value;
  }
  const staff = (id: string) =>
    source.accounts
      .all()
      .filter(
        (a) => ['DOCTOR', 'NURSE'].includes(a.role) && a.department?.id === id,
      );
  return {
    async list(status, signal) {
      const u = await ready('common', signal);
      if (status && !['ACTIVE', 'INACTIVE'].includes(status))
        return fail('VALIDATION_ERROR', '상태를 확인해 주세요.', 400);
      if (u.role !== 'ADMIN' && status === 'INACTIVE')
        return fail('FORBIDDEN', '활성 진료과만 선택할 수 있습니다.', 403);
      return structuredClone(
        source.departments.filter(
          (d) =>
            (!status || d.status === status) &&
            (u.role === 'ADMIN' || d.status === 'ACTIVE'),
        ),
      );
    },
    async create(name) {
      await ready('admin', undefined, true);
      const value = nameFor(name);
      let id: string;
      do {
        id = `demo-department-${++sequence}`;
      } while (source.departments.some((d) => d.id === id));
      const d: DepartmentSummary = { id, name: value, status: 'ACTIVE' };
      source.departments.push(d);
      return structuredClone(d);
    },
    async rename(id, name) {
      await ready('admin', undefined, true);
      const d = get(id);
      const value = nameFor(name, id);
      d.name = value;
      source.accounts.refreshDepartment(d);
      return structuredClone(d);
    },
    async changeStatus(id, status) {
      await ready('admin', undefined, true);
      const d = get(id);
      if (!['ACTIVE', 'INACTIVE'].includes(status))
        return fail('VALIDATION_ERROR', '상태를 확인해 주세요.', 400);
      if (status === 'INACTIVE' && d.status !== status && staff(id).length)
        return fail(
          'DEPARTMENT_HAS_STAFF',
          '소속 의료진이 있어 비활성화할 수 없습니다.',
        );
      d.status = status;
      source.accounts.refreshDepartment(d);
      return structuredClone(d);
    },
    async remove(id) {
      await ready('admin', undefined, true);
      get(id);
      // Exact server retention/reference policy is unresolved in OpenAPI §12.
      // Mock conservatively preserves every currently represented business reference.
      if (staff(id).length || source.referenced(id))
        return fail(
          'DEPARTMENT_IN_USE',
          '소속 의료진 또는 업무 참조 이력이 있어 삭제할 수 없습니다.',
        );
      source.departments.splice(
        source.departments.findIndex((d) => d.id === id),
        1,
      );
    },
    async medicalStaff(id, role, page, signal) {
      await ready('admin', signal);
      get(id);
      if (
        (role && !roles.includes(role)) ||
        ![page.page, page.size].every((n) => Number.isInteger(n) && n > 0)
      )
        return fail('VALIDATION_ERROR', '조회 조건을 확인해 주세요.', 400);
      const data = staff(id).filter((a) => !role || a.role === role);
      return {
        data: data.slice((page.page - 1) * page.size, page.page * page.size),
        meta: {
          ...page,
          totalItems: data.length,
          totalPages: Math.ceil(data.length / page.size),
        },
      };
    },
    async doctors(id, activeOnly, signal) {
      const u = await ready('doctors', signal);
      get(id);
      if (
        u.role === 'NURSE' &&
        (u.department?.id !== id || u.department.status !== 'ACTIVE')
      )
        return fail('FORBIDDEN', '본인 진료과 의사만 조회할 수 있습니다.', 403);
      return staff(id)
        .filter(
          (a) => a.role === 'DOCTOR' && (!activeOnly || a.status === 'ACTIVE'),
        )
        .map((a) => ({
          id: a.doctorId!,
          name: a.name,
          department: structuredClone(get(id)),
        }));
    },
    async move(id, departmentId) {
      await ready('admin', undefined, true);
      const a = source.accounts.get(id);
      const target = get(departmentId);
      if (!['DOCTOR', 'NURSE'].includes(a.role) || target.status !== 'ACTIVE')
        return fail(
          'VALIDATION_ERROR',
          '의료진 및 활성 진료과를 선택해 주세요.',
          400,
        );
      if (a.department?.id === target.id) return a;
      if (
        a.role === 'DOCTOR' &&
        a.doctorId &&
        source.doctorHasPendingWork(a.doctorId, businessDate())
      )
        return fail(
          'DOCTOR_HAS_PENDING_WORK',
          '처리되지 않은 예약·접수·진료가 있어 소속을 변경할 수 없습니다.',
        );
      const result = source.accounts.setDepartment(id, target);
      source.syncDoctors();
      return result;
    },
  };
}
