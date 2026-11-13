import { createScheduleState } from './doctorSchedule';
import { mockTimestamp } from './utils';
import { includesSlot, weekday } from '../../features/doctor/schedule';
import { ApiError } from '../api/errors';
import { mockAccounts } from './auth';
import type {
  AppointmentService,
  AppointmentFilters,
  AppointmentInput,
  AppointmentSlots,
} from '../../features/appointments/service';
import type {
  PageRequest,
  PageResult,
  StaffAppointment,
  StaffPatientSummary,
  StaffReception,
} from '../../features/staff/types';
import { normalizeDate } from '../../features/staff/validation';
import type { DepartmentSummary } from '../../types/auth';
import type { MockAccountStore } from './accounts';
/** DEVELOPMENT ONLY. Shares the patient repository; no browser storage. Codes other than
 * OUTSIDE_WORKING_HOURS are simulation labels, not a finalized server reason enum. */
export function createMockAppointments(
  source: {
    accounts?: MockAccountStore;
    patients(): StaffPatientSummary[];
    receptionForAppointment?(id: string): StaffReception | undefined;
    isEmpty(): boolean;
    seeded: StaffAppointment[];
    wait(signal?: AbortSignal, saving?: boolean): Promise<void>;
    page<T>(items: T[], input: PageRequest): PageResult<T>;
  },
  now = () => Date.now(),
) {
  const departments: DepartmentSummary[] = [
    { id: 'demo-internal', name: '내과', status: 'ACTIVE' as const },
    { id: 'demo-pediatric', name: '소아청소년과', status: 'ACTIVE' as const },
  ];
  const doctors = departments.flatMap((department, i) => [
    {
      id: i === 0 ? 'demo-doctor' : 'demo-doctor-2',
      name: i === 0 ? '가상의사' : '가상의사2',
      department,
    },
  ]);
  doctors.push({
    id: 'demo-doctor-3',
    name: '가상의사3',
    department: departments[0],
  });
  function syncDoctors() {
    for (const a of source.accounts?.all() ?? [])
      if (a.role === 'DOCTOR' && a.department) {
        const d = doctors.find((d) => d.id === a.doctorId);
        const department =
          departments.find((dep) => dep.id === a.department!.id) ??
          a.department;
        if (d) d.department = department;
        else doctors.push({ id: a.doctorId, name: a.name, department });
      }
  }
  const currentDepartment = (d: DepartmentSummary) => ({
    ...d,
    ...(departments.find((p) => p.id === d.id) ?? {}),
  });
  function doctorActive(id: string) {
    return (
      source.accounts
        ?.all()
        .find((a) => a.role === 'DOCTOR' && a.doctorId === id)?.status !==
      'INACTIVE'
    );
  }
  // Preserve Phase 3A's existing histories, but place other patients on distinct past dates.
  const records: StaffAppointment[] = source.seeded.map((item, index) => ({
    ...item,
    doctor: structuredClone(item.doctor),
    department: structuredClone(item.department),
    ...(index === 3
      ? {
          status: 'CANCELLED' as const,
          displayStatus: 'CANCELLED' as const,
          receptionId: null,
          cancelledAt: '2025-01-01T08:00:00+09:00',
        }
      : index === 4
        ? { displayStatus: 'CALLED' as const }
        : index === 5
          ? { displayStatus: 'IN_PROGRESS' as const }
          : {}),
    startsAt:
      index < 3
        ? item.startsAt
        : `2025-01-${String(Math.floor(index / 3) + 1).padStart(2, '0')}T${item.startsAt.slice(11)}`,
  }));
  const schedule = createScheduleState({
    doctors,
    appointments: records,
    projectAppointment: (a) => project(a),
    wait: source.wait,
  });
  let sequence = 0;
  const clone = <T>(value: T): T => structuredClone(value);
  function get(id: string) {
    const found = records.find((x) => x.id === id);
    if (!found)
      throw new ApiError('NOT_FOUND', '예약을 찾을 수 없습니다.', 404);
    return found;
  }
  function project(item: StaffAppointment) {
    return clone({
      ...item,
      department: currentDepartment(item.department),
      doctor: {
        ...item.doctor,
        department: currentDepartment(item.doctor.department),
      },
      ...(source.receptionForAppointment
        ? {
            receptionId: source.receptionForAppointment(item.id)?.id ?? null,
            displayStatus:
              item.status === 'CANCELLED'
                ? 'CANCELLED'
                : (source.receptionForAppointment(item.id)?.displayStatus ??
                  'BOOKED'),
          }
        : {}),
      patient:
        source.patients().find((p) => p.id === item.patient.id) ?? item.patient,
    });
  }
  function ensureMutable(item: StaffAppointment) {
    if (item.receptionId)
      throw new ApiError(
        'APPOINTMENT_ALREADY_RECEIVED',
        '접수된 예약은 변경하거나 취소할 수 없습니다.',
        409,
      );
    if (item.status === 'CANCELLED')
      throw new ApiError(
        'APPOINTMENT_CANCELLED',
        '이미 취소된 예약입니다.',
        409,
      );
  }
  function slots(
    doctorId: string,
    date: string,
    exclude?: string,
  ): AppointmentSlots {
    syncDoctors();
    if (!doctors.some((d) => d.id === doctorId) || !normalizeDate(date))
      throw new ApiError(
        'VALIDATION_ERROR',
        '의사와 날짜를 확인해 주세요.',
        400,
      );
    if (exclude) {
      const item = get(exclude);
      ensureMutable(item);
      if (item.doctor.id !== doctorId)
        throw new ApiError(
          'VALIDATION_ERROR',
          '예약 의사가 일치하지 않습니다.',
          400,
        );
    }
    const day = new Date(`${date}T12:00:00+09:00`).getUTCDay();
    return {
      date,
      intervalMinutes: 20,
      slots: Array.from(
        { length: schedule.edited(doctorId) ? 72 : 27 },
        (_, i) => {
          const minutes = (schedule.edited(doctorId) ? 0 : 540) + i * 20;
          const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
          const startsAt = `${date}T${time}:00+09:00`;
          const reason =
            !doctorActive(doctorId) ||
            !departments.some(
              (dep) =>
                dep.id ===
                  doctors.find((d) => d.id === doctorId)?.department.id &&
                dep.status === 'ACTIVE',
            )
              ? 'INACTIVE'
              : Date.parse(startsAt) <= now()
                ? 'PAST_TIME'
                : schedule.off(doctorId).some((l) => l.date === date)
                  ? 'LEAVE'
                  : !includesSlot(schedule.slots(doctorId), weekday(date), time)
                    ? !schedule.edited(doctorId) && time === '15:20'
                      ? 'LEAVE'
                      : day === 0 || day === 6
                        ? 'DAY_OFF'
                        : 'OUTSIDE_WORKING_HOURS'
                    : records.some(
                          (a) =>
                            a.id !== exclude &&
                            a.status === 'BOOKED' &&
                            a.doctor.id === doctorId &&
                            Date.parse(a.startsAt) === Date.parse(startsAt),
                        )
                      ? 'ALREADY_BOOKED'
                      : null;
          return { startsAt, available: reason === null, reason };
        },
      ),
    };
  }
  function checkTime(doctorId: string, startsAt: string, exclude?: string) {
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+09:00$/.test(startsAt) ||
      !slots(doctorId, startsAt.slice(0, 10), exclude).slots.some(
        (s) => s.startsAt === startsAt && s.available,
      )
    )
      throw new ApiError(
        'SLOT_UNAVAILABLE',
        '선택한 시간은 더 이상 예약할 수 없습니다.',
        409,
      );
  }
  function insert(
    input: AppointmentInput,
    account: import('../../types/auth').SelfAccount,
  ): StaffAppointment {
    syncDoctors();
    const patient = source.patients().find((p) => p.id === input.patientId);
    const doctor = doctors.find(
      (d) => d.id === input.doctorId && d.department.id === input.departmentId,
    );
    if (
      !patient ||
      !doctor ||
      !departments.some(
        (d) => d.id === input.departmentId && d.status === 'ACTIVE',
      ) ||
      doctor.department.status !== 'ACTIVE' ||
      !doctorActive(doctor.id)
    )
      throw new ApiError(
        'VALIDATION_ERROR',
        '환자·진료과·의사를 확인해 주세요.',
        400,
      );
    checkTime(doctor.id, input.startsAt);
    const item: StaffAppointment = {
      id: `demo-booking-${++sequence}`,
      patient,
      doctor: clone(doctor),
      department: clone(doctor.department),
      startsAt: input.startsAt,
      status: 'BOOKED',
      displayStatus: 'BOOKED',
      registeredBy: clone(account),
      receptionId: null,
    };
    records.push(item);
    return project(item);
  }
  const service: Omit<AppointmentService, 'create'> & {
    create(
      input: AppointmentInput,
      principal?: import('../../features/nurse/service').Principal,
    ): Promise<StaffAppointment>;
    list(
      filters: AppointmentFilters,
      page: PageRequest,
      signal?: AbortSignal,
      patientId?: string,
    ): Promise<PageResult<StaffAppointment>>;
  } = {
    async departments(signal) {
      await source.wait(signal);
      return clone(departments.filter((d) => d.status === 'ACTIVE'));
    },
    async doctors(id, signal) {
      await source.wait(signal);
      syncDoctors();
      return clone(
        doctors.filter(
          (d) =>
            d.department.id === id &&
            departments.some(
              (dep) => dep.id === id && dep.status === 'ACTIVE',
            ) &&
            doctorActive(d.id),
        ),
      );
    },
    async availability(id, signal) {
      await source.wait(signal);
      if (!doctors.some((d) => d.id === id))
        throw new ApiError('NOT_FOUND', '의사를 찾을 수 없습니다.', 404);
      return {
        doctorId: id,
        intervalMinutes: 20,
        weeklySlots: schedule.slots(id),
      };
    },
    async slots(id, date, exclude, signal) {
      await source.wait(signal);
      return source.isEmpty()
        ? { date, intervalMinutes: 20, slots: [] }
        : slots(id, date, exclude);
    },
    async list(
      filters: AppointmentFilters,
      input: PageRequest,
      signal?: AbortSignal,
      patientId?: string,
    ) {
      await source.wait(signal);
      return source.page(
        records
          .map(project)
          .filter(
            (a) =>
              (!patientId || a.patient.id === patientId) &&
              (!filters.patientName ||
                a.patient.name.includes(filters.patientName)) &&
              (!filters.date || a.startsAt.slice(0, 10) === filters.date) &&
              (!filters.departmentId ||
                a.department.id === filters.departmentId) &&
              (!filters.doctorId || a.doctor.id === filters.doctorId) &&
              (!filters.status || a.displayStatus === filters.status),
          )
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
        input,
      );
    },
    async detail(id, signal) {
      await source.wait(signal);
      return project(get(id));
    },
    async create(
      input: AppointmentInput,
      principal = async () => mockAccounts.STAFF,
    ) {
      const initialRaw = await principal();
      const initial = source.accounts
        ? source.accounts.resolvePrincipal(initialRaw)
        : initialRaw;
      await source.wait(undefined, true);
      const rawAccount = await principal();
      const account = source.accounts
        ? source.accounts.resolvePrincipal(rawAccount)
        : rawAccount;
      if (
        !account ||
        account.id !== initial?.id ||
        account.role !== initial?.role ||
        account.department?.id !== initial?.department?.id ||
        account.status !== 'ACTIVE' ||
        (account.role !== 'STAFF' &&
          (account.role !== 'NURSE' ||
            account.department?.status !== 'ACTIVE' ||
            account.department.id !== input.departmentId))
      )
        throw new ApiError('FORBIDDEN', '예약 등록 권한이 없습니다.', 403);
      return insert(input, account);
    },
    async reschedule(id, startsAt) {
      await source.wait(undefined, true);
      const item = get(id);
      ensureMutable(item);
      if (item.startsAt === startsAt) return project(item);
      checkTime(item.doctor.id, startsAt, id);
      item.startsAt = startsAt;
      return project(item);
    },
    async cancel(id) {
      await source.wait(undefined, true);
      const item = get(id);
      ensureMutable(item);
      item.status = 'CANCELLED';
      item.displayStatus = 'CANCELLED';
      item.cancelledAt = mockTimestamp(now());
      return project(item);
    },
  };
  return Object.assign(service, {
    schedule,
    repository: {
      appointments: records,
      doctors,
      departments,
      syncDoctors,
      currentDepartment,
      followUp: insert,
    },
  });
}
