import {
  apiAppointments,
  type AppointmentSlots,
} from '../appointments/service';
import type { NurseAppointment } from '../nurse/bookingService';
import { apiClient } from '../../services/api/client';
import type { ApiResponse, CursorMeta } from '../../types/api';
import type { Visit } from '../nurse/service';
import type { NursePatient } from '../nurse/bookingService';
import type { DisplayStatus, DoctorSummary } from '../staff/types';
import type { RecordAuthor, VersionSummary } from '../nurse/recordsService';
export interface DoctorPatientRow {
  patient: NursePatient;
  appointmentId?: string | null;
  receptionId?: string | null;
  visitId?: string | null;
  clinicalRecordId?: string | null;
  displayStatus: DisplayStatus;
  displayTime: string;
}
export interface ClinicalInput {
  symptoms: string;
  diagnosis: string;
  opinion: string;
}
export interface ClinicalVersion extends ClinicalInput {
  id: string;
  recordId: string;
  versionNo: number;
  correctionReason: string | null;
  author: RecordAuthor;
  createdAt: string;
}
export interface ClinicalRecord {
  id: string;
  visitId: string;
  latestVersion: ClinicalVersion;
  versions: VersionSummary[];
}
export interface ClinicalHistoryItem {
  visitId: string;
  receptionId: string;
  clinicalRecordId: string;
  department: DoctorSummary['department'];
  doctor: DoctorSummary;
  completedAt: string;
  summary: string;
}
/** VIS_04 record shape remains explicitly unconfirmed in OpenAPI. Use visit/version links. */
export interface Completion {
  visit: Visit;
  record: Record<string, unknown>;
  version: ClinicalVersion;
}
export interface ClinicalPage {
  data: ClinicalHistoryItem[];
  meta: CursorMeta;
}
export interface ClinicalCorrection extends ClinicalInput {
  baseVersionNo: number;
  correctionReason: string;
}
export interface ClinicalService {
  version(
    id: string,
    versionNo: number,
    signal?: AbortSignal,
  ): Promise<ClinicalVersion>;
  correct(id: string, input: ClinicalCorrection): Promise<ClinicalVersion>;
  followUpSlots(
    visitId: string,
    date: string,
    signal?: AbortSignal,
  ): Promise<AppointmentSlots>;
  followUp(visitId: string, startsAt: string): Promise<NurseAppointment>;
  patients(
    date: string,
    status?: DisplayStatus,
    signal?: AbortSignal,
  ): Promise<DoctorPatientRow[]>;
  visit(id: string, signal?: AbortSignal): Promise<Visit>;
  history(
    patientId: string,
    cursor?: { limit?: number; before?: string },
    signal?: AbortSignal,
  ): Promise<ClinicalPage>;
  complete(id: string, input: ClinicalInput): Promise<Completion>;
  record(id: string, signal?: AbortSignal): Promise<ClinicalRecord>;
}
export const apiClinicalService: ClinicalService = {
  async version(id, n, signal) {
    return (
      await apiClient.get<ApiResponse<ClinicalVersion>>(
        `/clinical-records/${encodeURIComponent(id)}/versions/${n}`,
        { signal },
      )
    ).data.data;
  },
  async correct(id, input) {
    const { baseVersionNo, symptoms, diagnosis, opinion, correctionReason } =
      input;
    return (
      await apiClient.post<ApiResponse<ClinicalVersion>>(
        `/clinical-records/${encodeURIComponent(id)}/versions`,
        { baseVersionNo, symptoms, diagnosis, opinion, correctionReason },
      )
    ).data.data;
  },
  async followUpSlots(id, date, signal) {
    const v = await apiClinicalService.visit(id, signal);
    return apiAppointments.slots(v.doctor.id, date, undefined, signal);
  },
  async followUp(id, startsAt) {
    return (
      await apiClient.post<ApiResponse<NurseAppointment>>(
        `/visits/${encodeURIComponent(id)}/follow-up-appointments`,
        { startsAt },
      )
    ).data.data;
  },
  async patients(date, status, signal) {
    return (
      await apiClient.get<ApiResponse<DoctorPatientRow[]>>(
        '/doctors/me/patients',
        { params: { date, status }, signal },
      )
    ).data.data;
  },
  async visit(id, signal) {
    return (
      await apiClient.get<ApiResponse<Visit>>(
        `/visits/${encodeURIComponent(id)}`,
        { signal },
      )
    ).data.data;
  },
  async history(id, cursor, signal) {
    return (
      await apiClient.get<ClinicalPage>(
        `/patients/${encodeURIComponent(id)}/clinical-history`,
        { params: cursor, signal },
      )
    ).data;
  },
  async complete(id, input) {
    const { symptoms, diagnosis, opinion } = input;
    return (
      await apiClient.post<ApiResponse<Completion>>(
        `/visits/${encodeURIComponent(id)}/complete`,
        { symptoms, diagnosis, opinion },
      )
    ).data.data;
  },
  async record(id, signal) {
    return (
      await apiClient.get<ApiResponse<ClinicalRecord>>(
        `/clinical-records/${encodeURIComponent(id)}`,
        { signal },
      )
    ).data.data;
  },
};
