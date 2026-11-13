import { apiClient } from '../../services/api/client';
import type { ApiResponse } from '../../types/api';
import type { DepartmentSummary, Role } from '../../types/auth';
import type { DoctorSummary, PageRequest, PageResult } from '../staff/types';
import type { AccountStatus, AccountSummary } from './service';

export interface DepartmentService {
  list(
    status?: AccountStatus,
    signal?: AbortSignal,
  ): Promise<DepartmentSummary[]>;
  create(name: string): Promise<DepartmentSummary>;
  rename(id: string, name: string): Promise<DepartmentSummary>;
  changeStatus(id: string, status: AccountStatus): Promise<DepartmentSummary>;
  remove(id: string): Promise<void>;
  medicalStaff(
    id: string,
    role: Role | undefined,
    page: PageRequest,
    signal?: AbortSignal,
  ): Promise<PageResult<AccountSummary>>;
  doctors(
    id: string,
    activeOnly?: boolean,
    signal?: AbortSignal,
  ): Promise<DoctorSummary[]>;
  move(accountId: string, departmentId: string): Promise<AccountSummary>;
}
const path = (id: string) => `/departments/${encodeURIComponent(id)}`;
/** DEP_01–08 client adapters only. DEP_08 follows the actual OpenAPI path. */
export const apiDepartments: DepartmentService = {
  async list(status, signal) {
    return (
      await apiClient.get<ApiResponse<DepartmentSummary[]>>('/departments', {
        params: { status },
        signal,
      })
    ).data.data;
  },
  async create(name) {
    return (
      await apiClient.post<ApiResponse<DepartmentSummary>>('/departments', {
        name,
      })
    ).data.data;
  },
  async rename(id, name) {
    return (
      await apiClient.patch<ApiResponse<DepartmentSummary>>(path(id), { name })
    ).data.data;
  },
  async changeStatus(id, status) {
    return (
      await apiClient.patch<ApiResponse<DepartmentSummary>>(
        `${path(id)}/status`,
        { status },
      )
    ).data.data;
  },
  async remove(id) {
    await apiClient.delete(path(id));
  },
  async medicalStaff(id, role, page, signal) {
    return (
      await apiClient.get<PageResult<AccountSummary>>(
        `${path(id)}/medical-staff`,
        { params: { role, ...page }, signal },
      )
    ).data;
  },
  async doctors(id, activeOnly, signal) {
    return (
      await apiClient.get<ApiResponse<DoctorSummary[]>>(`${path(id)}/doctors`, {
        params: { activeOnly },
        signal,
      })
    ).data.data;
  },
  async move(id, departmentId) {
    return (
      await apiClient.patch<ApiResponse<AccountSummary>>(
        `/medical-staff/${encodeURIComponent(id)}/department`,
        { departmentId },
      )
    ).data.data;
  },
};
