import { createMockClinical } from './clinical';
import { mockTimestamp } from './utils';
import { createMockNursingRecords } from './nursingRecords';
import type {
  NurseService,
  Principal,
  NurseReception,
  Visit,
} from '../../features/nurse/service';
import { ApiError } from '../api/errors';
import type {
  ReceptionService,
  ReceptionFilters,
} from '../../features/receptions/service';
import type {
  DoctorSummary,
  PageRequest,
  PageResult,
  StaffAppointment,
  StaffPatientSummary,
  StaffReception,
} from '../../features/staff/types';
import { businessDate } from '../../features/staff/format';
import { normalizeDate } from '../../features/staff/validation';
import type { DepartmentSummary } from '../../types/auth';
/** DEVELOPMENT ONLY. Tombstones simulate exclusion, not a backend retention policy.
 * Call/visit fixtures are pre-existing states; nursing notes share this repository. */
export function createMockReceptions(source: {
  currentDepartment?(department: DepartmentSummary): DepartmentSummary;
  followUp?(
    v: Visit,
    startsAt: string,
    account: import('../../types/auth').SelfAccount,
  ): StaffAppointment;
  slots?(
    doctorId: string,
    date: string,
    exclude?: string,
    signal?: AbortSignal,
  ): Promise<import('../../features/appointments/service').AppointmentSlots>;
  patients(): StaffPatientSummary[];
  seedWalkIns?: boolean;
  appointments: StaffAppointment[];
  doctors: DoctorSummary[];
  wait(signal?: AbortSignal, saving?: boolean): Promise<void>;
  page<T>(items: T[], input: PageRequest): PageResult<T>;
}) {
  type Record = { row: StaffReception; nursing: boolean; deleted: boolean };
  const records: Record[] = source.appointments
    .filter((a) => a.receptionId && a.status === 'BOOKED')
    .map((a) => {
      const complete = a.displayStatus === 'COMPLETED';
      const inProgress = a.displayStatus === 'IN_PROGRESS';
      return {
        deleted: false,
        nursing:
          complete || (a.id.endsWith('-1') && a.displayStatus === 'REGISTERED'),
        row: {
          id: a.receptionId!,
          patient: a.patient,
          doctor: a.doctor,
          department: a.department,
          appointmentId: a.id,
          receivedAt: `${a.startsAt.slice(0, 10)}T${a.id.endsWith('-0') ? '09:16' : a.id.endsWith('-1') ? '09:31' : '09:30'}:00+09:00`,
          status: a.displayStatus === 'CALLED' ? 'CALLED' : 'REGISTERED',
          displayStatus: a.displayStatus,
          visitStatus: complete
            ? 'COMPLETED'
            : inProgress
              ? 'IN_PROGRESS'
              : null,
          visitId: complete || inProgress ? `demo-visit-${a.id}` : null,
        },
      };
    });
  // Two independent walk-in fixtures keep the dashboard's original preview shape.
  (source.seedWalkIns === false ? [] : source.patients().slice(0, 2)).forEach(
    (patient, i) =>
      records.push({
        deleted: false,
        nursing: false,
        row: {
          id: `demo-walkin-${patient.id}`,
          patient,
          doctor: structuredClone(source.doctors[0]),
          department: structuredClone(source.doctors[0].department),
          appointmentId: null,
          receivedAt: `${businessDate()}T09:${i === 0 ? '42' : '41'}:00+09:00`,
          status: i === 0 ? 'CALLED' : 'REGISTERED',
          displayStatus: i === 0 ? 'CALLED' : 'REGISTERED',
          visitStatus: null,
          visitId: null,
        },
      }),
  );
  let sequence = 0;
  const active = (r: Record) => !r.deleted && r.row.status !== 'CANCELLED';
  function display(row: StaffReception): StaffReception['displayStatus'] {
    return row.visitStatus === 'COMPLETED'
      ? 'COMPLETED'
      : row.visitStatus === 'IN_PROGRESS'
        ? 'IN_PROGRESS'
        : row.status === 'CALLED'
          ? 'CALLED'
          : 'REGISTERED';
  }
  function project(r: Record) {
    return structuredClone({
      ...r.row,
      department:
        source.currentDepartment?.(r.row.department) ?? r.row.department,
      doctor: {
        ...r.row.doctor,
        department:
          source.currentDepartment?.(r.row.doctor.department) ??
          r.row.doctor.department,
      },
      patient:
        source.patients().find((p) => p.id === r.row.patient.id) ??
        r.row.patient,
      displayStatus: display(r.row),
    });
  }
  function get(id: string) {
    const r = records.find((r) => active(r) && r.row.id === id);
    if (!r) throw new ApiError('NOT_FOUND', '접수를 찾을 수 없습니다.', 404);
    return r;
  }
  function appointmentReception(id: string) {
    const r = records.find((r) => active(r) && r.row.appointmentId === id);
    return r ? project(r) : undefined;
  }
  const service: ReceptionService & {
    list(
      filters: ReceptionFilters,
      page: PageRequest,
      signal?: AbortSignal,
      patientId?: string,
    ): Promise<PageResult<StaffReception>>;
    history(
      id: string,
      page: PageRequest,
      signal?: AbortSignal,
    ): Promise<PageResult<StaffReception>>;
  } = {
    async list(
      filters: ReceptionFilters,
      input: PageRequest,
      signal?: AbortSignal,
      patientId?: string,
    ) {
      await source.wait(signal);
      if (!normalizeDate(filters.date))
        throw new ApiError(
          'VALIDATION_ERROR',
          '조회 날짜를 선택해 주세요.',
          400,
        );
      return source.page(
        records
          .filter(active)
          .map(project)
          .filter(
            (r) =>
              (!patientId || r.patient.id === patientId) &&
              r.receivedAt.slice(0, 10) === filters.date &&
              (!filters.name || r.patient.name.includes(filters.name)) &&
              (!filters.birthDate ||
                r.patient.birthDate === filters.birthDate) &&
              (!filters.departmentId ||
                r.department.id === filters.departmentId) &&
              (!filters.doctorId || r.doctor.id === filters.doctorId) &&
              (!filters.status || r.displayStatus === filters.status),
          )
          .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
        input,
      );
    },
    async history(id, input, signal) {
      await source.wait(signal);
      return source.page(
        records
          .filter((r) => active(r) && r.row.patient.id === id)
          .map(project)
          .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
        input,
      );
    },
    async detail(id, signal) {
      await source.wait(signal);
      return project(get(id));
    },
    async create(input) {
      await source.wait(undefined, true);
      const keys = Object.keys(input);
      const reserved = typeof input.appointmentId === 'string';
      if (
        reserved
          ? keys.length !== 1
          : keys.length !== 3 ||
            !['patientId', 'departmentId', 'doctorId'].every((k) =>
              keys.includes(k),
            )
      )
        throw new ApiError(
          'VALIDATION_ERROR',
          '예약 접수와 현장 접수 정보를 섞을 수 없습니다.',
          400,
        );
      let patientId: string;
      let doctor: DoctorSummary;
      let appointment: StaffAppointment | undefined;
      if (reserved) {
        appointment = source.appointments.find(
          (a) => a.id === input.appointmentId,
        );
        if (!appointment)
          throw new ApiError('NOT_FOUND', '예약을 찾을 수 없습니다.', 404);
        if (appointment.status !== 'BOOKED')
          throw new ApiError(
            'APPOINTMENT_CANCELLED',
            '취소된 예약은 접수할 수 없습니다.',
            409,
          );
        if (appointment.startsAt.slice(0, 10) !== businessDate())
          throw new ApiError(
            'APPOINTMENT_DATE_MISMATCH',
            '예약일 당일에만 접수할 수 있습니다.',
            409,
          );
        if (appointmentReception(appointment.id))
          throw new ApiError(
            'DUPLICATE_ACTIVE_RECEPTION',
            '이미 접수된 예약입니다.',
            409,
          );
        patientId = appointment.patient.id;
        doctor = appointment.doctor;
      } else {
        patientId = input.patientId!;
        const found = source.doctors.find(
          (d) =>
            d.id === input.doctorId && d.department.id === input.departmentId,
        );
        if (!found)
          throw new ApiError(
            'VALIDATION_ERROR',
            '진료과와 담당 의사를 확인해 주세요.',
            400,
          );
        doctor = found;
      }
      const patient = source.patients().find((p) => p.id === patientId);
      if (!patient)
        throw new ApiError('NOT_FOUND', '환자를 찾을 수 없습니다.', 404);
      if (
        records.some(
          (r) =>
            active(r) &&
            r.row.patient.id === patientId &&
            r.row.doctor.id === doctor.id &&
            r.row.receivedAt.slice(0, 10) === businessDate() &&
            r.row.visitStatus !== 'COMPLETED',
        )
      )
        throw new ApiError(
          'DUPLICATE_ACTIVE_RECEPTION',
          '같은 환자·의사의 미완료 접수가 이미 있습니다.',
          409,
        );
      const row: StaffReception = {
        id: `demo-checkin-${++sequence}`,
        patient,
        doctor: structuredClone(doctor),
        department: structuredClone(doctor.department),
        appointmentId: appointment?.id ?? null,
        receivedAt: mockTimestamp(),
        status: 'REGISTERED',
        displayStatus: 'REGISTERED',
        visitId: null,
        visitStatus: null,
      };
      const r = { row, nursing: false, deleted: false };
      records.push(r);
      if (appointment) appointment.receptionId = row.id;
      return project(r);
    },
    async remove(id) {
      await source.wait(undefined, true);
      const r = get(id);
      if (r.nursing)
        throw new ApiError(
          'RECEPTION_HAS_NURSING_RECORDS',
          '간호 기록이 작성된 접수는 삭제할 수 없습니다.',
          409,
        );
      if (r.row.visitStatus)
        throw new ApiError(
          'VISIT_ALREADY_STARTED',
          '진료가 시작된 접수는 삭제할 수 없습니다.',
          409,
        );
      r.deleted = true;
      if (r.row.status === 'CALLED') r.row.status = 'REGISTERED';
      if (r.row.appointmentId) {
        const a = source.appointments.find((a) => a.id === r.row.appointmentId);
        if (a && a.receptionId === id) a.receptionId = null;
      }
    },
  };
  const visits = new Map<string, Visit>();
  for (const r of records)
    if (r.row.visitId && r.row.visitStatus) {
      const { patientNumber, ...patient } = r.row.patient;
      void patientNumber;
      visits.set(r.row.visitId, {
        id: r.row.visitId,
        receptionId: r.row.id,
        patient,
        department: r.row.department,
        doctor: r.row.doctor,
        status: r.row.visitStatus,
        startedAt: r.row.receivedAt,
        completedAt:
          r.row.visitStatus === 'COMPLETED' ? r.row.receivedAt : null,
      });
    }
  const clinical = createMockClinical({
    projectVisit: (v) => ({
      ...v,
      department: source.currentDepartment?.(v.department) ?? v.department,
      doctor: {
        ...v.doctor,
        department:
          source.currentDepartment?.(v.doctor.department) ??
          v.doctor.department,
      },
    }),
    followUp: (v, t, u) => {
      if (!source.followUp)
        throw new ApiError(
          'NOT_IMPLEMENTED',
          '예약 저장소가 연결되지 않았습니다.',
          501,
        );
      return source.followUp(v, t, u);
    },
    slots: (id, date, exclude, signal) => {
      if (!source.slots)
        throw new ApiError(
          'NOT_IMPLEMENTED',
          '슬롯 저장소가 연결되지 않았습니다.',
          501,
        );
      return source.slots(id, date, exclude, signal);
    },
    visits,
    rows: () => records.filter(active).map(project),
    appointments: source.appointments,
    wait: source.wait,
    finish: (v) => {
      const r = get(v.receptionId);
      if (r.row.visitId !== v.id)
        throw new ApiError(
          'VALIDATION_ERROR',
          '진료 연결이 변경되었습니다.',
          400,
        );
      visits.set(v.id, v);
      r.row.visitStatus = v.status;
    },
  });

  function nurse(principal: Principal): NurseService {
    async function authorize() {
      const u = await principal();
      if (
        !u ||
        u.role !== 'NURSE' ||
        u.status !== 'ACTIVE' ||
        !u.department ||
        u.department.status !== 'ACTIVE'
      )
        throw new ApiError(
          'FORBIDDEN',
          '본인 진료과의 간호사만 이용할 수 있습니다.',
          403,
        );
      return u.department.id;
    }
    function scoped(id: string, departmentId: string) {
      const r = get(id);
      if (r.row.department.id !== departmentId)
        throw new ApiError(
          'FORBIDDEN',
          '다른 진료과에 접근할 수 없습니다.',
          403,
        );
      return r;
    }
    function redact(row: StaffReception): NurseReception {
      const { patientNumber: unused, ...patient } = row.patient;
      void unused;
      return { ...row, patient };
    }
    function busy(doctorId: string) {
      return records.some(
        (r) =>
          active(r) &&
          r.row.doctor.id === doctorId &&
          r.row.visitStatus === 'IN_PROGRESS',
      );
    }
    return {
      async list(filters, input, signal) {
        const dep = await authorize();
        if (filters.departmentId && filters.departmentId !== dep)
          throw new ApiError('FORBIDDEN', '다른 진료과 조회 불가', 403);
        const result = await service.list(
          { ...filters, departmentId: dep },
          input,
          signal,
        );
        if ((await authorize()) !== dep)
          throw new ApiError('FORBIDDEN', '세션이 변경되었습니다.', 403);
        return { ...result, data: result.data.map(redact) };
      },
      async detail(id, signal) {
        const dep = await authorize();
        await source.wait(signal);
        if ((await authorize()) !== dep)
          throw new ApiError('FORBIDDEN', '세션이 변경되었습니다.', 403);
        return redact(project(scoped(id, dep)));
      },
      async doctors(signal) {
        const dep = await authorize();
        await source.wait(signal);
        if ((await authorize()) !== dep)
          throw new ApiError('FORBIDDEN', '세션 변경', 403);
        return structuredClone(
          source.doctors.filter((d) => d.department.id === dep),
        );
      },
      async call(id) {
        const dep = await authorize();
        await source.wait(undefined, true);
        if ((await authorize()) !== dep)
          throw new ApiError('FORBIDDEN', '세션 변경', 403);
        const r = scoped(id, dep);
        if (busy(r.row.doctor.id))
          throw new ApiError('DOCTOR_BUSY', '담당 의사가 진료 중입니다.', 409);
        if (r.row.status !== 'REGISTERED' || r.row.visitStatus)
          throw new ApiError(
            'INVALID_STATE',
            '접수 완료 환자만 호출할 수 있습니다.',
            400,
          );
        let previousCalledReceptionId: string | null = null;
        for (const other of records)
          if (
            active(other) &&
            other.row.doctor.id === r.row.doctor.id &&
            other.row.status === 'CALLED' &&
            !other.row.visitStatus
          ) {
            other.row.status = 'REGISTERED';
            previousCalledReceptionId = other.row.id;
          }
        r.row.status = 'CALLED';
        return { reception: redact(project(r)), previousCalledReceptionId };
      },
      async enter(id) {
        const dep = await authorize();
        await source.wait(undefined, true);
        if ((await authorize()) !== dep)
          throw new ApiError('FORBIDDEN', '세션 변경', 403);
        const r = scoped(id, dep);
        if (busy(r.row.doctor.id))
          throw new ApiError('DOCTOR_BUSY', '담당 의사가 진료 중입니다.', 409);
        if (r.row.status !== 'CALLED' || r.row.visitStatus)
          throw new ApiError(
            'INVALID_STATE',
            '현재 호출된 환자만 입실 확인할 수 있습니다.',
            400,
          );
        const visit: Visit = {
          id: `demo-entry-visit-${++sequence}`,
          receptionId: id,
          patient: redact(project(r)).patient,
          department: r.row.department,
          doctor: r.row.doctor,
          status: 'IN_PROGRESS',
          startedAt: mockTimestamp(),
        };
        visits.set(visit.id, visit);
        r.row.visitId = visit.id;
        r.row.visitStatus = 'IN_PROGRESS';
        return structuredClone(visit);
      },
    };
  }
  return Object.assign(service, {
    nurse,
    clinical,
    nursing: createMockNursingRecords({
      reception: (id) => project(get(id)),
      doctorCanAccess: (patientId, doctorId) =>
        records.some(
          ({ row, deleted }) =>
            !deleted &&
            row.patient.id === patientId &&
            row.doctor.id === doctorId,
        ) ||
        source.appointments.some(
          (a) =>
            a.patient.id === patientId &&
            a.doctor.id === doctorId &&
            a.status === 'BOOKED',
        ),
      markNursing: (id) => {
        get(id).nursing = true;
      },
      wait: source.wait,
    }),
    repository: {
      completed: (patientId: string) =>
        [...visits.values()]
          .filter(
            (v) =>
              v.status === 'COMPLETED' &&
              v.clinicalRecordId &&
              !v.clinicalRecordId.startsWith('demo-clinical-seed-') &&
              v.patient.id === patientId,
          )
          .map((v) => ({
            visitId: v.id,
            patientId,
            department:
              source.currentDepartment?.(v.department) ?? v.department,
            doctor: { id: v.doctor.id, name: v.doctor.name },
            completedAt: v.completedAt!,
            displayStatus: 'COMPLETED' as const,
          })),
      all: () => records.filter(active).map(project),
      referencesDepartment: (id: string) =>
        records.some((r) => r.row.department.id === id) ||
        [...visits.values()].some((v) => v.department.id === id),
      appointmentReception,
      visit: (id: string) => {
        const value = visits.get(id);
        return value
          ? structuredClone({
              ...value,
              department:
                source.currentDepartment?.(value.department) ??
                value.department,
              doctor: {
                ...value.doctor,
                department:
                  source.currentDepartment?.(value.doctor.department) ??
                  value.doctor.department,
              },
            })
          : undefined;
      },
    },
  });
}
