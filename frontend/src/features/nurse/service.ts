import { apiClient } from '../../services/api/client';
import type { ApiResponse } from '../../types/api';
import type { SelfAccount } from '../../types/auth';
import type {
  StaffReception,
  StaffPatientSummary,
  PageRequest,
  PageResult,
  DoctorSummary,
} from '../staff/types';
import type { ReceptionFilters } from '../receptions/service';
export type NurseReception = Omit<StaffReception, 'patient'> & {
  patient: Omit<StaffPatientSummary, 'patientNumber'>;
};
export interface Visit {
  id: string;
  receptionId: string;
  patient: NurseReception['patient'];
  department: DoctorSummary['department'];
  doctor: DoctorSummary;
  status: 'IN_PROGRESS' | 'COMPLETED';
  startedAt: string;
  completedAt?: string | null;
  clinicalRecordId?: string | null;
}
export interface CallResult {
  reception: NurseReception;
  previousCalledReceptionId: string | null;
}
export type Principal = () => Promise<SelfAccount | null>;
export interface NurseService {
  list(
    filters: ReceptionFilters,
    page: PageRequest,
    signal?: AbortSignal,
  ): Promise<PageResult<NurseReception>>;
  detail(id: string, signal?: AbortSignal): Promise<NurseReception>;
  doctors(signal?: AbortSignal): Promise<DoctorSummary[]>;
  call(id: string): Promise<CallResult>;
  enter(id: string): Promise<Visit>;
}
const path = (id: string) => `/receptions/${encodeURIComponent(id)}`;
export function apiNurseService(principal: Principal): NurseService {
  return {
    async list(filters, page, signal) {
      return (
        await apiClient.get<PageResult<NurseReception>>('/receptions', {
          params: { ...filters, ...page },
          signal,
        })
      ).data;
    },
    async detail(id, signal) {
      return (
        await apiClient.get<ApiResponse<NurseReception>>(path(id), { signal })
      ).data.data;
    },
    async doctors(signal) {
      const user = await principal();
      if (!user?.department) throw new Error('소속 진료과를 확인해 주세요.');
      return (
        await apiClient.get<ApiResponse<DoctorSummary[]>>(
          `/departments/${encodeURIComponent(user.department.id)}/doctors`,
          { params: { activeOnly: true }, signal },
        )
      ).data.data;
    },
    async call(id) {
      return (await apiClient.post<ApiResponse<CallResult>>(`${path(id)}/call`))
        .data.data;
    },
    async enter(id) {
      return (
        await apiClient.post<ApiResponse<Visit>>(`${path(id)}/confirm-entry`)
      ).data.data;
    },
  };
}
