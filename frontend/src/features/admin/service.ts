import { apiClient } from '../../services/api/client';
import type { ApiResponse } from '../../types/api';
import type { DepartmentSummary, Role, SelfAccount } from '../../types/auth';
import type { PageRequest, PageResult } from '../staff/types';

export type AccountStatus = SelfAccount['status'];
export type AccountSummary = Pick<
  SelfAccount,
  'id' | 'name' | 'email' | 'role' | 'status' | 'department'
> & { doctorId?: string | null };
export interface AdminDashboard {
  accountsByRole: Record<Role, number>;
  departmentsByStatus: Record<AccountStatus, number>;
}
export interface AccountFilters {
  name?: string;
  email?: string;
  role?: Role;
  status?: AccountStatus;
}
export interface AccountInvitation {
  name: string;
  email: string;
  role: Role;
  departmentId?: string | null;
}
export interface AdminService {
  dashboard(signal?: AbortSignal): Promise<AdminDashboard>;
  list(
    filters: AccountFilters,
    page: PageRequest,
    signal?: AbortSignal,
  ): Promise<PageResult<AccountSummary>>;
  detail(id: string, signal?: AbortSignal): Promise<AccountSummary>;
  departments(signal?: AbortSignal): Promise<DepartmentSummary[]>;
  invite(input: AccountInvitation): Promise<{ message: string }>;
  changeStatus(id: string, status: AccountStatus): Promise<AccountSummary>;
  requestPasswordReset(id: string): Promise<{ message: string }>;
  readonly mock?: true;
}
const accountPath = (id: string) => `/accounts/${encodeURIComponent(id)}`;
/** Exact DASH_03, ACC_01–05, DEP_01 contracts. No API failure fallback. */
export const apiAdminService: AdminService = {
  async dashboard(signal) {
    return (
      await apiClient.get<ApiResponse<AdminDashboard>>('/dashboards/admin', {
        signal,
      })
    ).data.data;
  },
  async list(filters, page, signal) {
    return (
      await apiClient.get<PageResult<AccountSummary>>('/accounts', {
        params: { ...filters, ...page },
        signal,
      })
    ).data;
  },
  async detail(id, signal) {
    return (
      await apiClient.get<ApiResponse<AccountSummary>>(accountPath(id), {
        signal,
      })
    ).data.data;
  },
  async departments(signal) {
    return (
      await apiClient.get<ApiResponse<DepartmentSummary[]>>('/departments', {
        params: { status: 'ACTIVE' },
        signal,
      })
    ).data.data;
  },
  async invite({ name, email, role, departmentId }) {
    return (
      await apiClient.post<ApiResponse<{ message: string }>>(
        '/account-invitations',
        {
          name,
          email,
          role,
          ...(['DOCTOR', 'NURSE'].includes(role) ? { departmentId } : {}),
        },
      )
    ).data.data;
  },
  async changeStatus(id, status) {
    return (
      await apiClient.patch<ApiResponse<AccountSummary>>(
        `${accountPath(id)}/status`,
        { status },
      )
    ).data.data;
  },
  async requestPasswordReset(id) {
    return (
      await apiClient.post<ApiResponse<{ message: string }>>(
        `${accountPath(id)}/password-reset`,
      )
    ).data.data;
  },
};
