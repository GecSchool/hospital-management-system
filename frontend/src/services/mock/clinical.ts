import { mockAccounts } from './auth';
import { mockTimestamp as stamp, mockRecordAuthor as author } from './utils';
import { ApiError } from '../api/errors';
import type { Principal, Visit } from '../../features/nurse/service';
import type {
  ClinicalService,
  ClinicalRecord,
  ClinicalInput,
  ClinicalVersion,
} from '../../features/doctor/clinicalService';
import type {
  StaffReception,
  StaffAppointment,
} from '../../features/staff/types';
import {
  nurseAppointment,
  nursePatient,
} from '../../features/nurse/bookingService';
import { normalizeDate } from '../../features/staff/validation';
import type { SelfAccount } from '../../types/auth';
/** DEVELOPMENT ONLY: clinical originals share intake's Visit Map and reception objects. */
export function createMockClinical(source: {
  projectVisit?(visit: Visit): Visit;
  followUp(v: Visit, startsAt: string, account: SelfAccount): StaffAppointment;
  slots(
    doctorId: string,
    date: string,
    exclude?: string,
    signal?: AbortSignal,
  ): Promise<import('../../features/appointments/service').AppointmentSlots>;
  visits: Map<string, Visit>;
  rows(): StaffReception[];
  appointments: StaffAppointment[];
  finish(visit: Visit): void;
  wait(signal?: AbortSignal, saving?: boolean): Promise<void>;
}) {
  const records = new Map<string, ClinicalRecord>();
  const versions = new Map<string, ClinicalVersion[]>();
  let sequence = 0;
  // Synthetic originals for already-completed legacy Visit fixtures, created once at factory setup.
  // No historical clinical facts are inferred; original string fields are explicitly empty.
  for (const v of source.visits.values())
    if (v.status === 'COMPLETED') {
      const id = `demo-clinical-seed-${v.id}`;
      const createdAt = v.completedAt ?? v.startedAt;
      const a = author(mockAccounts.DOCTOR);
      const version: ClinicalVersion = {
        recordId: id,
        versionNo: 1,
        symptoms: '',
        diagnosis: '',
        opinion: '',
        correctionReason: null,
        author: a,
        createdAt,
      };
      versions.set(id, [version]);
      records.set(id, {
        id,
        visitId: v.id,
        latestVersion: version,
        versions: [{ versionNo: 1, author: a, createdAt }],
      });
      source.finish({ ...v, completedAt: createdAt, clinicalRecordId: id });
    }
  return (principal: Principal): ClinicalService => {
    const deny = () => {
      throw new ApiError(
        'FORBIDDEN',
        '담당 의사의 허용된 진료만 이용할 수 있습니다.',
        403,
      );
    };
    async function auth() {
      const u = await principal();
      if (!u || u.role !== 'DOCTOR' || u.status !== 'ACTIVE' || !u.doctorId)
        return deny();
      return u;
    }
    async function ready(signal?: AbortSignal, saving = false) {
      const u = await auth();
      const sig = `${u.id}:${u.doctorId}:${u.department?.id}`;
      await source.wait(signal, saving);
      const after = await auth();
      if (sig !== `${after.id}:${after.doctorId}:${after.department?.id}`)
        return deny();
      return after;
    }
    function visit(id: string, doctorId: string) {
      const v = source.visits.get(id);
      if (!v) throw new ApiError('NOT_FOUND', '진료를 찾을 수 없습니다.', 404);
      if (v.doctor.id !== doctorId) return deny();
      const r = source.rows().find((r) => r.id === v.receptionId);
      if (!r || r.patient.id !== v.patient.id || r.doctor.id !== doctorId)
        return deny();
      return {
        ...(source.projectVisit?.(v) ?? v),
        patient: nursePatient(r.patient),
      };
    }
    function ownedRecord(id: string, doctorId: string) {
      const r = records.get(id);
      if (!r)
        throw new ApiError('NOT_FOUND', '진료 기록을 찾을 수 없습니다.', 404);
      const v = visit(r.visitId, doctorId);
      if (v.status !== 'COMPLETED')
        throw new ApiError(
          'VALIDATION_ERROR',
          '완료된 진료에서만 가능합니다.',
          400,
        );
      return r;
    }
    return {
      async version(id, n, signal) {
        const u = await ready(signal);
        ownedRecord(id, u.doctorId);
        if (!Number.isInteger(n) || n < 1)
          throw new ApiError('VALIDATION_ERROR', '버전을 확인해 주세요.', 400);
        const v = versions.get(id)?.find((v) => v.versionNo === n);
        if (!v)
          throw new ApiError('NOT_FOUND', '버전을 찾을 수 없습니다.', 404);
        return structuredClone(v);
      },
      async correct(id, input) {
        const u = await ready(undefined, true);
        const r = ownedRecord(id, u.doctorId);
        if (
          !input ||
          !['symptoms', 'diagnosis', 'opinion', 'correctionReason'].every(
            (k) => typeof input[k as keyof typeof input] === 'string',
          ) ||
          !input.correctionReason.trim() ||
          !Number.isInteger(input.baseVersionNo) ||
          input.baseVersionNo < 1
        )
          throw new ApiError(
            'VALIDATION_ERROR',
            '내용과 정정 사유 및 기준 버전을 확인해 주세요.',
            400,
          );
        if (input.baseVersionNo !== r.latestVersion.versionNo)
          throw new ApiError(
            'VERSION_CONFLICT',
            '최신 기록이 변경되었습니다. 초안을 유지한 채 최신 기록을 다시 조회해 주세요.',
            409,
          );
        const v: ClinicalVersion = {
          recordId: id,
          versionNo: input.baseVersionNo + 1,
          symptoms: input.symptoms,
          diagnosis: input.diagnosis,
          opinion: input.opinion,
          correctionReason: input.correctionReason,
          author: author(u),
          createdAt: stamp(),
        };
        versions.get(id)!.push(v);
        records.set(id, {
          ...r,
          latestVersion: v,
          versions: [
            ...r.versions,
            {
              versionNo: v.versionNo,
              author: v.author,
              createdAt: v.createdAt,
            },
          ],
        });
        return structuredClone(v);
      },
      async followUpSlots(id, date, signal) {
        const u = await ready(signal);
        const v = visit(id, u.doctorId);
        if (v.status !== 'COMPLETED')
          throw new ApiError(
            'VALIDATION_ERROR',
            '완료된 진료에서만 재진 예약할 수 있습니다.',
            400,
          );
        const result = await source.slots(v.doctor.id, date, undefined, signal);
        const after = await auth();
        if (
          u.id !== after.id ||
          u.doctorId !== after.doctorId ||
          u.department?.id !== after.department?.id
        )
          return deny();
        visit(id, after.doctorId);
        return result;
      },
      async followUp(id, startsAt) {
        const u = await ready(undefined, true);
        const v = visit(id, u.doctorId);
        if (v.status !== 'COMPLETED')
          throw new ApiError(
            'VALIDATION_ERROR',
            '완료된 진료에서만 재진 예약할 수 있습니다.',
            400,
          );
        return nurseAppointment(source.followUp(v, startsAt, u));
      },
      async patients(date, status, signal) {
        const u = await ready(signal);
        if (!normalizeDate(date))
          throw new ApiError(
            'VALIDATION_ERROR',
            '조회 날짜를 확인해 주세요.',
            400,
          );
        const rows = source
          .rows()
          .filter(
            (r) =>
              r.doctor.id === u.doctorId && r.receivedAt.slice(0, 10) === date,
          );
        const appointments = source.appointments.filter(
          (a) => a.doctor.id === u.doctorId && a.startsAt.slice(0, 10) === date,
        );
        return structuredClone(
          [
            ...appointments.map((a) => {
              const r = rows.find(
                (r) => r.appointmentId === a.id || r.id === a.receptionId,
              );
              return {
                patient: nursePatient(r?.patient ?? a.patient),
                appointmentId: a.id,
                receptionId: r?.id,
                visitId: r?.visitId,
                clinicalRecordId: r?.visitId
                  ? source.visits.get(r.visitId)?.clinicalRecordId
                  : undefined,
                displayTime: a.startsAt,
                displayStatus:
                  a.status === 'CANCELLED'
                    ? ('CANCELLED' as const)
                    : (r?.displayStatus ?? ('BOOKED' as const)),
              };
            }),
            ...rows
              .filter(
                (r) =>
                  !appointments.some(
                    (a) => a.id === r.appointmentId || a.receptionId === r.id,
                  ),
              )
              .map((r) => ({
                patient: nursePatient(r.patient),
                receptionId: r.id,
                visitId: r.visitId,
                clinicalRecordId: r.visitId
                  ? source.visits.get(r.visitId)?.clinicalRecordId
                  : undefined,
                displayTime: r.receivedAt,
                displayStatus: r.displayStatus,
              })),
          ]
            .filter((r) => !status || r.displayStatus === status)
            .sort((a, b) => a.displayTime.localeCompare(b.displayTime)),
        );
      },
      async visit(id, signal) {
        const u = await ready(signal);
        return structuredClone(visit(id, u.doctorId));
      },
      async history(patientId, cursor = {}, signal) {
        const u = await ready(signal);
        if (
          !source
            .rows()
            .some(
              (r) => r.patient.id === patientId && r.doctor.id === u.doctorId,
            ) &&
          !source.appointments.some(
            (a) => a.patient.id === patientId && a.doctor.id === u.doctorId,
          )
        )
          return deny();
        const items = [...records.values()]
          .flatMap((r) => {
            const v = source.visits.get(r.visitId);
            return v?.status === 'COMPLETED' && v.patient.id === patientId
              ? [
                  {
                    visitId: v.id,
                    receptionId: v.receptionId,
                    clinicalRecordId: r.id,
                    department:
                      source.projectVisit?.(v).department ?? v.department,
                    doctor: v.doctor,
                    completedAt: v.completedAt!,
                    summary: r.latestVersion.diagnosis,
                  },
                ]
              : [];
          })
          .sort(
            (a, b) =>
              a.completedAt.localeCompare(b.completedAt) ||
              a.clinicalRecordId.localeCompare(b.clinicalRecordId),
          );
        const limit = cursor.limit ?? 5;
        const end = cursor.before
          ? items.findIndex((r) => r.clinicalRecordId === cursor.before)
          : items.length;
        if (!Number.isInteger(limit) || limit < 1 || end < 0)
          throw new ApiError(
            'VALIDATION_ERROR',
            '이력 조회 조건을 확인해 주세요.',
            400,
          );
        const start = Math.max(0, end - limit);
        return structuredClone({
          data: items.slice(start, end),
          meta: {
            hasMore: start > 0,
            nextBefore: start > 0 ? items[start].clinicalRecordId : null,
          },
        });
      },
      async complete(id, input) {
        const u = await ready(undefined, true);
        const v = visit(id, u.doctorId);
        if (v.status === 'COMPLETED')
          throw new ApiError(
            'VISIT_ALREADY_COMPLETED',
            '이미 완료된 진료입니다. 기존 기록은 변경하지 않았습니다.',
            409,
          );
        if (v.status !== 'IN_PROGRESS')
          throw new ApiError(
            'VALIDATION_ERROR',
            '진료 중 상태에서만 완료할 수 있습니다.',
            400,
          );
        if (
          !input ||
          !['symptoms', 'diagnosis', 'opinion'].every(
            (k) => typeof input[k as keyof ClinicalInput] === 'string',
          )
        )
          throw new ApiError(
            'VALIDATION_ERROR',
            '증상·진단·소견 문자열 필드를 확인해 주세요.',
            400,
          );
        const recordId = `demo-clinical-${++sequence}`;
        const createdAt = stamp();
        const version: ClinicalVersion = {
          recordId,
          versionNo: 1,
          symptoms: input.symptoms,
          diagnosis: input.diagnosis,
          opinion: input.opinion,
          correctionReason: null,
          author: author(u),
          createdAt,
        };
        const record: ClinicalRecord = {
          id: recordId,
          visitId: id,
          latestVersion: version,
          versions: [{ versionNo: 1, author: version.author, createdAt }],
        };
        const completed = {
          ...v,
          status: 'COMPLETED' as const,
          completedAt: createdAt,
          clinicalRecordId: recordId,
        };
        // All validation is complete. No await in the atomic in-memory commit.
        source.finish(completed);
        versions.set(recordId, [version]);
        records.set(recordId, record);
        return structuredClone({
          visit: completed,
          record: { id: recordId, visitId: id },
          version,
        });
      },
      async record(id, signal) {
        const u = await ready(signal);
        const record = records.get(id);
        if (!record)
          throw new ApiError(
            'NOT_FOUND',
            '기록 원본이 없는 과거 Mock 진료입니다.',
            404,
          );
        visit(record.visitId, u.doctorId);
        return structuredClone(record);
      },
    };
  };
}
