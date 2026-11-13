import { scopedNurseBooking } from './nurseBooking';
import { createMockAdminService } from './admin';
import { createMockDepartments } from './departments';
import type { Principal } from '../../features/nurse/service';
import { mockAccountStore, type MockAccountStore } from './accounts';
import { createMockReceptions } from './receptions';
import { createMockAppointments } from './appointments';
import { ApiError } from '../api/errors';
import type {
  MockStaffScenario,
  StaffService,
} from '../../features/staff/staffService';
import type {
  PageRequest,
  PageResult,
  PatientCreate,
  PatientUpdate,
  StaffAppointment,
  StaffPatientDetail,
  StaffPatientSummary,
  StaffVisitSummary,
} from '../../features/staff/types';
import { businessDate } from '../../features/staff/format';
import {
  normalizeDate,
  validPhoneShape,
  validResidentShape,
} from '../../features/staff/validation';
import { mockAccounts } from './auth';

/** DEVELOPMENT ONLY. Synthetic names, no real identifiers, in-memory lifetime only. */
export function createMockStaffService({
  latencyMs = 150,
  count = 25,
  accounts = mockAccountStore,
}: {
  latencyMs?: number;
  count?: number;
  accounts?: MockAccountStore;
} = {}): StaffService {
  let scenario: MockStaffScenario = 'normal';
  let sequence = count;
  const patients: StaffPatientDetail[] = Array.from(
    { length: count },
    (_, index) => ({
      id: index === 0 ? 'demo-patient' : `demo-patient-${index + 1}`,
      patientNumber: `P${String(1042 - index).padStart(7, '0')}`,
      name: `가상환자${String(index + 1).padStart(3, '0')}`,
      birthDate:
        index === 0
          ? '1985-03-14'
          : `1990-01-${String((index % 28) + 1).padStart(2, '0')}`,
      phone: `010-0000-${String(index + 1).padStart(4, '0')}`,
      maskedResidentNumber: `${index === 0 ? '850314' : `9001${String((index % 28) + 1).padStart(2, '0')}`}-•••••••`,
    }),
  );
  // Histories are pre-existing fixtures for seeded patients only. Registration creates no business records.
  const historyPatientIds = new Set(patients.map((patient) => patient.id));
  const department = {
    id: 'demo-internal',
    name: '내과',
    status: 'ACTIVE' as const,
  };
  const doctor = { id: 'demo-doctor', name: '가상의사', department };
  function summary(patient: StaffPatientDetail): StaffPatientSummary {
    const { id, patientNumber, name, birthDate, phone } = patient;
    return { id, patientNumber, name, birthDate, phone };
  }
  function get(id: string) {
    const patient = patients.find((item) => item.id === id);
    if (!patient)
      throw new ApiError('NOT_FOUND', '환자를 찾을 수 없습니다.', 404);
    return patient;
  }
  async function wait(signal?: AbortSignal, saving = false) {
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const timer = setTimeout(
        () => {
          signal?.removeEventListener('abort', abort);
          resolve();
        },
        scenario === 'slow' ? 1800 : latencyMs,
      );
      signal?.addEventListener('abort', abort, { once: true });
    });
    if (scenario === 'error' || (saving && scenario === 'save-error'))
      throw new ApiError(
        'MOCK_SERVER_ERROR',
        '개발용 서버 오류 시뮬레이션입니다.',
        500,
      );
  }
  function page<T>(items: T[], input: PageRequest): PageResult<T> {
    const data = scenario === 'empty' ? [] : items;
    return structuredClone({
      data: data.slice((input.page - 1) * input.size, input.page * input.size),
      meta: {
        ...input,
        totalItems: data.length,
        totalPages: Math.ceil(data.length / input.size),
      },
    });
  }
  function syntheticIdentity(raw: string) {
    const digits = raw.replace('-', '');
    if (!validResidentShape(raw) || !digits.endsWith('0000000'))
      throw new ApiError('MOCK_SYNTHETIC_ONLY', '합성 번호만 허용합니다.', 400);
    // Simulation only, NOT a real identity/birth-date decoding policy. Do not retain raw digits.
    const birthDate = normalizeDate(
      `19${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`,
    );
    if (!birthDate)
      throw new ApiError('VALIDATION_ERROR', '가상 생년월일 형식 오류', 400);
    return { birthDate, maskedResidentNumber: `${digits.slice(0, 6)}-•••••••` };
  }
  function validate(input: PatientCreate | PatientUpdate) {
    if (
      (input.name !== undefined && !input.name.trim()) ||
      (input.phone !== undefined && !validPhoneShape(input.phone))
    )
      throw new ApiError('VALIDATION_ERROR', '입력 형식 오류', 400);
  }
  function seedAppointments(patient: StaffPatientDetail): StaffAppointment[] {
    if (!historyPatientIds.has(patient.id)) return [];
    return ['09:00', '09:20', '10:00'].map((time, index) => ({
      id: `demo-appointment-${patient.id}-${index}`,
      patient: summary(patient),
      doctor,
      department,
      startsAt: `${businessDate()}T${time}:00+09:00`,
      status: 'BOOKED',
      displayStatus: index === 0 ? 'COMPLETED' : 'REGISTERED',
      registeredBy: structuredClone(mockAccounts.STAFF),
      receptionId: `demo-reception-${patient.id}-${index}`,
    }));
  }
  function visits(patient: StaffPatientDetail): StaffVisitSummary[] {
    if (!historyPatientIds.has(patient.id)) return [];
    return [0, 1].map((index) => ({
      visitId: `demo-visit-${patient.id}-${index}`,
      patientId: patient.id,
      department: { id: department.id, name: department.name },
      doctor: { id: doctor.id, name: doctor.name },
      completedAt: `2026-${index === 0 ? '10-16T10:30' : '09-21T14:00'}:00+09:00`,
      displayStatus: 'COMPLETED',
    }));
  }
  let intake: ReturnType<typeof createMockReceptions>;
  const booking = createMockAppointments({
    accounts,
    receptionForAppointment: (id) =>
      intake?.repository.appointmentReception(id),
    patients: () => patients.map(summary),
    isEmpty: () => scenario === 'empty',
    seeded: patients.flatMap(seedAppointments),
    wait,
    page,
  });
  accounts.configureDepartments((id) =>
    booking.repository.departments.find((d) => d.id === id),
  );
  intake = createMockReceptions({
    currentDepartment: booking.repository.currentDepartment,
    followUp: (v, time, u) =>
      booking.repository.followUp(
        {
          patientId: v.patient.id,
          departmentId: v.department.id,
          doctorId: v.doctor.id,
          startsAt: time,
        },
        u,
      ),
    slots: booking.slots,
    patients: () => patients.map(summary),
    appointments: booking.repository.appointments,
    doctors: booking.repository.doctors,
    wait,
    page,
  });
  const live =
    (p: Principal): Principal =>
    async () =>
      accounts.resolvePrincipal(await p());
  const doctorHasPendingWork = (doctorId: string, today: string) =>
    booking.repository.appointments.some(
      (a) =>
        a.doctor.id === doctorId &&
        a.status !== 'CANCELLED' &&
        a.startsAt.slice(0, 10) >= today &&
        !intake.repository.appointmentReception(a.id),
    ) ||
    intake.repository
      .all()
      .some(
        (r) =>
          r.doctor.id === doctorId &&
          (r.visitStatus !== 'COMPLETED' ||
            (r.visitId &&
              intake.repository.visit(r.visitId)?.status === 'IN_PROGRESS')),
      );
  const service: StaffService = {
    departments: (principal) =>
      createMockDepartments(
        {
          accounts,
          departments: booking.repository.departments,
          wait,
          doctorHasPendingWork,
          syncDoctors: booking.repository.syncDoctors,
          referenced: (id) =>
            booking.repository.appointments.some(
              (a) => a.department.id === id,
            ) || intake.repository.referencesDepartment(id),
        },
        live(principal),
      ),
    admin: (principal) =>
      createMockAdminService(
        {
          accounts,
          departments: () => booking.repository.departments,
          wait,
          doctorHasPendingWork,
        },
        principal,
      ),
    clinical: (p) => intake.clinical(live(p)),
    doctor: (p) =>
      booking.schedule.bind(
        live(p),
        intake.repository.all,
        intake.repository.visit,
      ),
    nurseBooking: (p) =>
      scopedNurseBooking(service, live(p), (input) =>
        booking.create(input, live(p)),
      ),
    booking,
    intake,
    nurse: (p) => intake.nurse(live(p)),
    nursing: (p) => intake.nursing(live(p)),
    development: {
      getScenario() {
        return scenario;
      },
      setScenario(value) {
        scenario = value;
      },
    },
    async list(filters, input, signal) {
      await wait(signal);
      const filtered = patients.filter(
        (patient) =>
          (!filters.name || patient.name.includes(filters.name)) &&
          (!filters.patientNumber ||
            patient.patientNumber.includes(filters.patientNumber)) &&
          (!filters.birthDate || patient.birthDate === filters.birthDate) &&
          (!filters.phone ||
            patient.phone
              .replaceAll('-', '')
              .includes(filters.phone.replaceAll('-', ''))),
      );
      return page(filtered.map(summary), input);
    },
    async detail(id, signal) {
      await wait(signal);
      return structuredClone(get(id));
    },
    async create(input) {
      await wait(undefined, true);
      validate(input);
      if (!input.name?.trim() || !input.phone || !input.residentNumber)
        throw new ApiError('VALIDATION_ERROR', '필수값 오류', 400);
      const identity = syntheticIdentity(input.residentNumber);
      sequence += 1;
      const patient = {
        id: `demo-created-${sequence}`,
        patientNumber: `P${String(1042 + sequence).padStart(7, '0')}`,
        name: input.name.trim(),
        phone: input.phone,
        ...identity,
      };
      patients.unshift(patient);
      return structuredClone(patient);
    },
    async update(id, input) {
      await wait(undefined, true);
      validate(input);
      const patient = get(id);
      const identity =
        input.residentNumber === undefined
          ? {}
          : syntheticIdentity(input.residentNumber);
      Object.assign(
        patient,
        identity,
        input.name === undefined ? {} : { name: input.name.trim() },
        input.phone === undefined ? {} : { phone: input.phone },
      );
      return structuredClone(patient);
    },
    async appointments(id, input, signal) {
      await wait(signal);
      get(id);
      return booking.list({ patientName: undefined }, input, signal, id);
    },
    async receptions(id, input, signal) {
      await wait(signal);
      get(id);
      return intake.history(id, input, signal);
    },
    async visits(id, input, signal) {
      await wait(signal);
      return page(
        [
          ...visits(get(id)).map((v) => ({
            ...v,
            department: booking.repository.currentDepartment({
              ...department,
              ...v.department,
            }),
          })),
          ...intake.repository.completed(id),
        ].sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
        input,
      );
    },
    async dashboard(date = businessDate(), signal) {
      await wait(signal);
      const receptionPreview = (
        await intake.list({ date }, { page: 1, size: 4 }, signal)
      ).data;
      const appointmentPreview =
        scenario === 'empty'
          ? []
          : (await booking.list({ date }, { page: 1, size: 5 }, signal)).data;
      return structuredClone({ date, receptionPreview, appointmentPreview });
    },
  };
  return service;
}
