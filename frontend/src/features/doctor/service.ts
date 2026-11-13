import { apiClient } from '../../services/api/client';
import type { ApiResponse } from '../../types/api';
import type { Availability } from '../appointments/service';
import type { NurseAppointment } from '../nurse/bookingService';
import type { NurseReception, Visit } from '../nurse/service';
export type WeeklySlot = Availability['weeklySlots'][number];
export interface Leave {
  id: string;
  date: string;
}
export interface DoctorSchedule {
  from: string;
  to: string;
  availability: WeeklySlot[];
  leaves: Leave[];
  appointments: NurseAppointment[];
  receptions: NurseReception[];
  visits: Visit[];
}
export interface DoctorService {
  availability(doctorId: string, signal?: AbortSignal): Promise<Availability>;
  save(weeklySlots: WeeklySlot[]): Promise<Availability>;
  leaves(
    doctorId: string,
    from: string,
    to: string,
    signal?: AbortSignal,
  ): Promise<Leave[]>;
  leave(date: string): Promise<Leave>;
  schedule(
    from: string,
    to: string,
    signal?: AbortSignal,
  ): Promise<DoctorSchedule>;
}
const path = (id: string) => `/doctors/${encodeURIComponent(id)}`;
export const apiDoctorService: DoctorService = {
  async availability(id, signal) {
    return (
      await apiClient.get<ApiResponse<Availability>>(
        `${path(id)}/availability`,
        { signal },
      )
    ).data.data;
  },
  async save(weeklySlots) {
    return (
      await apiClient.put<ApiResponse<Availability>>(
        '/doctors/me/availability',
        { weeklySlots },
      )
    ).data.data;
  },
  async leaves(id, from, to, signal) {
    return (
      await apiClient.get<ApiResponse<Leave[]>>(`${path(id)}/leaves`, {
        params: { from, to },
        signal,
      })
    ).data.data;
  },
  async leave(date) {
    return (
      await apiClient.post<ApiResponse<Leave>>('/doctors/me/leaves', { date })
    ).data.data;
  },
  async schedule(from, to, signal) {
    return (
      await apiClient.get<ApiResponse<DoctorSchedule>>('/doctors/me/schedule', {
        params: { from, to },
        signal,
      })
    ).data.data;
  },
};
