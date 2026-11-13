import type { ApiResponse, PageMeta } from '../../types/api';
import type { DepartmentSummary, SelfAccount } from '../../types/auth';

export interface StaffPatientSummary {
  id: string;
  patientNumber: string;
  name: string;
  birthDate: string;
  phone: string;
}
export interface StaffPatientDetail extends StaffPatientSummary {
  maskedResidentNumber: string;
}
export interface PatientCreate {
  name: string;
  residentNumber: string;
  phone: string;
}
export type PatientUpdate = Partial<PatientCreate>;
export interface PatientFilters {
  patientNumber?: string;
  name?: string;
  birthDate?: string;
  phone?: string;
}
export interface PageRequest {
  page: number;
  size: number;
}
export type PageResult<T> = ApiResponse<T[], PageMeta>;
export type DisplayStatus =
  | 'BOOKED'
  | 'CANCELLED'
  | 'REGISTERED'
  | 'CALLED'
  | 'IN_PROGRESS'
  | 'COMPLETED';
export interface DoctorSummary {
  id: string;
  name: string;
  department: DepartmentSummary;
}
export interface StaffAppointment {
  id: string;
  patient: StaffPatientSummary;
  doctor: DoctorSummary;
  department: DepartmentSummary;
  startsAt: string;
  status: 'BOOKED' | 'CANCELLED';
  displayStatus: DisplayStatus;
  registeredBy: Omit<SelfAccount, 'doctorId'> & { doctorId?: string | null };
  receptionId?: string | null;
  cancelledAt?: string | null;
}
export interface StaffReception {
  id: string;
  patient: StaffPatientSummary;
  department: DepartmentSummary;
  doctor: DoctorSummary;
  receivedAt: string;
  status: 'REGISTERED' | 'CALLED' | 'CANCELLED';
  displayStatus: DisplayStatus;
  appointmentId?: string | null;
  visitId?: string | null;
  visitStatus?: 'IN_PROGRESS' | 'COMPLETED' | null;
}
export interface StaffVisitSummary {
  visitId: string;
  patientId: string;
  department: { id: string; name: string };
  doctor: { id: string; name: string };
  completedAt: string;
  displayStatus: DisplayStatus;
}
export interface StaffDashboard {
  date: string;
  receptionPreview: StaffReception[];
  appointmentPreview: StaffAppointment[];
}
export type HistoryKind = 'appointments' | 'receptions' | 'visits';
