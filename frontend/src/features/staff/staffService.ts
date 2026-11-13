import type { ClinicalService } from '../doctor/clinicalService';
import type { AdminService } from '../admin/service';
import type { DepartmentService } from '../admin/departmentService';
import type { DoctorService } from '../doctor/service';
import type { NurseBooking } from '../nurse/bookingService';
import type { NursingService } from '../nurse/recordsService';
import type { NurseService, Principal } from '../nurse/service';
import type { ReceptionService } from '../receptions/service';
import type { AppointmentService } from '../appointments/service';
import type {
  PageRequest,
  PageResult,
  PatientCreate,
  PatientFilters,
  PatientUpdate,
  StaffAppointment,
  StaffDashboard,
  StaffPatientDetail,
  StaffPatientSummary,
  StaffReception,
  StaffVisitSummary,
} from './types';
export type MockStaffScenario =
  'normal' | 'empty' | 'error' | 'slow' | 'save-error';
export interface StaffService {
  departments(principal: Principal): DepartmentService;
  admin(principal: Principal): AdminService;
  clinical(principal: Principal): ClinicalService;
  doctor(principal: Principal): DoctorService;
  booking: AppointmentService;
  intake: ReceptionService;
  nurseBooking(principal: Principal): NurseBooking;
  nurse(principal: Principal): NurseService;
  nursing(principal: Principal): NursingService;
  list(
    filters: PatientFilters,
    page: PageRequest,
    signal?: AbortSignal,
  ): Promise<PageResult<StaffPatientSummary>>;
  detail(id: string, signal?: AbortSignal): Promise<StaffPatientDetail>;
  create(input: PatientCreate): Promise<StaffPatientDetail>;
  update(id: string, input: PatientUpdate): Promise<StaffPatientDetail>;
  appointments(
    id: string,
    page: PageRequest,
    signal?: AbortSignal,
  ): Promise<PageResult<StaffAppointment>>;
  receptions(
    id: string,
    page: PageRequest,
    signal?: AbortSignal,
  ): Promise<PageResult<StaffReception>>;
  visits(
    id: string,
    page: PageRequest,
    signal?: AbortSignal,
  ): Promise<PageResult<StaffVisitSummary>>;
  dashboard(date?: string, signal?: AbortSignal): Promise<StaffDashboard>;
  readonly development?: {
    getScenario(): MockStaffScenario;
    setScenario(scenario: MockStaffScenario): void;
  };
}
