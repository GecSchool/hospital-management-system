import { apiClient } from '../../services/api/client';
import type { ApiResponse } from '../../types/api';
import type { DepartmentSummary } from '../../types/auth';
import type {
  DoctorSummary,
  DisplayStatus,
  PageRequest,
  PageResult,
  StaffAppointment,
} from '../staff/types';
export interface AppointmentFilters {
  patientName?: string;
  date?: string;
  departmentId?: string;
  doctorId?: string;
  status?: DisplayStatus;
}
export interface AppointmentInput {
  patientId: string;
  departmentId: string;
  doctorId: string;
  startsAt: string;
}
export interface AppointmentSlots {
  date: string;
  intervalMinutes: 20;
  slots: { startsAt: string; available: boolean; reason?: string | null }[];
}
export interface Availability {
  doctorId: string;
  intervalMinutes: 20;
  weeklySlots: { dayOfWeek: number; startTime: string; endTime: string }[];
}
export interface AppointmentService<A = StaffAppointment> {
  departments(signal?: AbortSignal): Promise<DepartmentSummary[]>;
  doctors(departmentId: string, signal?: AbortSignal): Promise<DoctorSummary[]>;
  availability(doctorId: string, signal?: AbortSignal): Promise<Availability>;
  slots(
    doctorId: string,
    date: string,
    excludeAppointmentId?: string,
    signal?: AbortSignal,
  ): Promise<AppointmentSlots>;
  list(
    filters: AppointmentFilters,
    page: PageRequest,
    signal?: AbortSignal,
  ): Promise<PageResult<A>>;
  detail(id: string, signal?: AbortSignal): Promise<A>;
  create(input: AppointmentInput): Promise<A>;
  reschedule(id: string, startsAt: string): Promise<A>;
  cancel(id: string, reason?: string): Promise<A>;
}
const path = (id: string) => `/appointments/${encodeURIComponent(id)}`;
const doctorPath = (id: string) => `/doctors/${encodeURIComponent(id)}`;
export const apiAppointments: AppointmentService = {
  async departments(signal) {
    return (
      await apiClient.get<ApiResponse<DepartmentSummary[]>>('/departments', {
        params: { status: 'ACTIVE' },
        signal,
      })
    ).data.data;
  },
  async doctors(id, signal) {
    return (
      await apiClient.get<ApiResponse<DoctorSummary[]>>(
        `/departments/${encodeURIComponent(id)}/doctors`,
        { params: { activeOnly: true }, signal },
      )
    ).data.data;
  },
  async availability(id, signal) {
    return (
      await apiClient.get<ApiResponse<Availability>>(
        `${doctorPath(id)}/availability`,
        { signal },
      )
    ).data.data;
  },
  async slots(id, date, excludeAppointmentId, signal) {
    return (
      await apiClient.get<ApiResponse<AppointmentSlots>>(
        `${doctorPath(id)}/appointment-slots`,
        {
          params: {
            date,
            ...(excludeAppointmentId ? { excludeAppointmentId } : {}),
          },
          signal,
        },
      )
    ).data.data;
  },
  async list(filters, page, signal) {
    return (
      await apiClient.get<PageResult<StaffAppointment>>('/appointments', {
        params: { ...filters, ...page },
        signal,
      })
    ).data;
  },
  async detail(id, signal) {
    return (
      await apiClient.get<ApiResponse<StaffAppointment>>(path(id), { signal })
    ).data.data;
  },
  async create(input) {
    return (
      await apiClient.post<ApiResponse<StaffAppointment>>(
        '/appointments',
        input,
      )
    ).data.data;
  },
  async reschedule(id, startsAt) {
    return (
      await apiClient.patch<ApiResponse<StaffAppointment>>(`${path(id)}/time`, {
        startsAt,
      })
    ).data.data;
  },
  async cancel(id, reason) {
    return (
      await apiClient.post<ApiResponse<StaffAppointment>>(
        `${path(id)}/cancel`,
        reason ? { reason } : {},
      )
    ).data.data;
  },
};
