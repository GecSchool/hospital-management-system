import { apiClient } from '../../services/api/client';
import type { ApiResponse } from '../../types/api';
import type {
  DisplayStatus,
  PageRequest,
  PageResult,
  StaffReception,
} from '../staff/types';
export type ReceptionInput =
  | {
      appointmentId: string;
      patientId?: never;
      departmentId?: never;
      doctorId?: never;
    }
  | {
      patientId: string;
      departmentId: string;
      doctorId: string;
      appointmentId?: never;
    };
export interface ReceptionFilters {
  date: string;
  name?: string;
  birthDate?: string;
  departmentId?: string;
  doctorId?: string;
  status?: DisplayStatus;
}
export interface ReceptionService {
  list(
    filters: ReceptionFilters,
    page: PageRequest,
    signal?: AbortSignal,
  ): Promise<PageResult<StaffReception>>;
  detail(id: string, signal?: AbortSignal): Promise<StaffReception>;
  create(input: ReceptionInput): Promise<StaffReception>;
  remove(id: string): Promise<void>;
}
const path = (id: string) => `/receptions/${encodeURIComponent(id)}`;
export const apiReceptions: ReceptionService = {
  async list(filters, page, signal) {
    return (
      await apiClient.get<PageResult<StaffReception>>('/receptions', {
        params: { ...filters, ...page },
        signal,
      })
    ).data;
  },
  async detail(id, signal) {
    return (
      await apiClient.get<ApiResponse<StaffReception>>(path(id), { signal })
    ).data.data;
  },
  async create(input) {
    return (
      await apiClient.post<ApiResponse<StaffReception>>('/receptions', input)
    ).data.data;
  },
  async remove(id) {
    await apiClient.delete(path(id));
  },
};
