import { apiClinicalService } from '../doctor/clinicalService';
import { apiAdminService } from '../admin/service';
import { apiDepartments } from '../admin/departmentService';
import { apiDoctorService } from '../doctor/service';
import { apiNurseBooking } from '../nurse/bookingService';
import { apiNursingService } from '../nurse/recordsService';
import { apiNurseService } from '../nurse/service';
import { apiReceptions } from '../receptions/service';
import { apiAppointments } from '../appointments/service';
import { apiClient } from '../../services/api/client';
import type { ApiResponse } from '../../types/api';
import type { StaffService } from './staffService';
import type {
  PageResult,
  StaffAppointment,
  StaffDashboard,
  StaffPatientDetail,
  StaffPatientSummary,
  StaffReception,
  StaffVisitSummary,
} from './types';
const patientPath = (id: string) => `/patients/${encodeURIComponent(id)}`;
/** Patient/dashboard operations plus the separate reservation adapter. Reception writes use the separate intake adapter. */
export const apiStaffService: StaffService = {
  departments: () => apiDepartments,
  admin: () => apiAdminService,
  clinical: () => apiClinicalService,
  doctor: () => apiDoctorService,
  booking: apiAppointments,
  intake: apiReceptions,
  nurse: apiNurseService,
  nurseBooking: () => apiNurseBooking,
  nursing: () => apiNursingService,
  async list(filters, page, signal) {
    return (
      await apiClient.get<PageResult<StaffPatientSummary>>('/patients', {
        params: { ...filters, ...page },
        signal,
      })
    ).data;
  },
  async detail(id, signal) {
    return (
      await apiClient.get<ApiResponse<StaffPatientDetail>>(patientPath(id), {
        signal,
      })
    ).data.data;
  },
  async create(input) {
    return (
      await apiClient.post<ApiResponse<StaffPatientDetail>>('/patients', input)
    ).data.data;
  },
  async update(id, input) {
    return (
      await apiClient.patch<ApiResponse<StaffPatientDetail>>(
        patientPath(id),
        input,
      )
    ).data.data;
  },
  async appointments(id, page, signal) {
    return (
      await apiClient.get<PageResult<StaffAppointment>>('/appointments', {
        params: { patientId: id, ...page },
        signal,
      })
    ).data;
  },
  async receptions(id, page, signal) {
    return (
      await apiClient.get<PageResult<StaffReception>>('/receptions', {
        params: { patientId: id, ...page },
        signal,
      })
    ).data;
  },
  async visits(id, page, signal) {
    return (
      await apiClient.get<PageResult<StaffVisitSummary>>(
        `${patientPath(id)}/visits`,
        { params: page, signal },
      )
    ).data;
  },
  async dashboard(date, signal) {
    return (
      await apiClient.get<ApiResponse<StaffDashboard>>('/dashboards/staff', {
        params: date ? { date } : undefined,
        signal,
      })
    ).data.data;
  },
};
