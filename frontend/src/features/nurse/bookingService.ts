import type { AppointmentService } from '../appointments/service';
import type {
  StaffAppointment,
  StaffPatientSummary,
  PatientFilters,
  PageRequest,
  PageResult,
} from '../staff/types';
import { apiAppointments } from '../appointments/service';
import { apiClient } from '../../services/api/client';
export type NursePatient = Omit<StaffPatientSummary, 'patientNumber'>;
export type NurseAppointment = Omit<StaffAppointment, 'patient'> & {
  patient: NursePatient;
};
export interface NurseBooking {
  booking: AppointmentService<NurseAppointment>;
  list(
    filters: Omit<PatientFilters, 'patientNumber'>,
    page: PageRequest,
    signal?: AbortSignal,
  ): Promise<PageResult<NursePatient>>;
  detail(id: string, signal?: AbortSignal): Promise<NursePatient>;
}
export const nursePatient = (p: NursePatient): NursePatient => ({
  id: p.id,
  name: p.name,
  birthDate: p.birthDate,
  phone: p.phone,
});
export const nurseAppointment = (a: NurseAppointment): NurseAppointment => ({
  ...a,
  patient: nursePatient(a.patient),
});
export const apiNurseBooking: NurseBooking = {
  booking: {
    ...apiAppointments,
    async list(f, p, signal) {
      const r = await apiAppointments.list(f, p, signal);
      return { ...r, data: r.data.map(nurseAppointment) };
    },
    async detail(id, signal) {
      return nurseAppointment(await apiAppointments.detail(id, signal));
    },
    async create(input) {
      return nurseAppointment(await apiAppointments.create(input));
    },
    async reschedule() {
      throw new Error('예약 변경 권한이 없습니다.');
    },
    async cancel() {
      throw new Error('예약 취소 권한이 없습니다.');
    },
  },
  async list(filters, page, signal) {
    const { name, birthDate, phone } = filters;
    const r = (
      await apiClient.get<PageResult<NursePatient>>('/patients', {
        params: { name, birthDate, phone, ...page },
        signal,
      })
    ).data;
    return { ...r, data: r.data.map(nursePatient) };
  },
  async detail(id, signal) {
    const r = await apiClient.get<{ data: NursePatient }>(
      `/patients/${encodeURIComponent(id)}`,
      { signal },
    );
    return nursePatient(r.data.data);
  },
};
