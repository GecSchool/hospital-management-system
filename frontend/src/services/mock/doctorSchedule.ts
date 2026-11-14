import { ApiError } from '../api/errors';
import type {
  DoctorService,
  Leave,
  WeeklySlot,
} from '../../features/doctor/service';
import {
  includesSlot,
  normalizedSlots,
  weekday,
} from '../../features/doctor/schedule';
import type { Principal } from '../../features/nurse/service';
import {
  nurseAppointment,
  nursePatient,
} from '../../features/nurse/bookingService';
import type {
  DoctorSummary,
  StaffAppointment,
  StaffReception,
} from '../../features/staff/types';
import type { Visit } from '../../features/nurse/service';
import { normalizeDate } from '../../features/staff/validation';
/** DEVELOPMENT ONLY. State belongs to the central booking factory. */
export function createScheduleState(source: {
  doctors: DoctorSummary[];
  appointments: StaffAppointment[];
  projectAppointment?(appointment: StaffAppointment): StaffAppointment;
  wait(signal?: AbortSignal, saving?: boolean): Promise<void>;
}) {
  const times = new Map<string, WeeklySlot[]>();
  const leaves = new Map<string, Leave[]>();
  const defaults = () =>
    [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
      { dayOfWeek, startTime: '09:00', endTime: '12:00' },
      { dayOfWeek, startTime: '13:00', endTime: '15:20' },
      { dayOfWeek, startTime: '15:40', endTime: '18:00' },
    ]);
  const slots = (id: string) => structuredClone(times.get(id) ?? defaults());
  const off = (id: string) => structuredClone(leaves.get(id) ?? []);
  function range(from: string, to: string) {
    if (!normalizeDate(from) || !normalizeDate(to) || from > to)
      throw new ApiError('VALIDATION_ERROR', '날짜 범위를 확인해 주세요.', 400);
  }
  return {
    slots,
    off,
    edited: (id: string) => times.has(id),
    bind(
      principal: Principal,
      receptionRows: () => StaffReception[],
      visit: (id: string) => Visit | undefined,
    ): DoctorService {
      const deny = () => {
        throw new ApiError(
          'FORBIDDEN',
          '허용된 의사 정보만 이용할 수 있습니다.',
          403,
        );
      };
      async function auth(id?: string, write = false) {
        const u = await principal();
        if (!u || u.status !== 'ACTIVE') return deny();
        if (write) {
          if (
            u.role !== 'DOCTOR' ||
            !source.doctors.some((d) => d.id === u.doctorId)
          )
            return deny();
        } else if (id) {
          const d = source.doctors.find((d) => d.id === id);
          if (!d) return deny();
          if (
            u.role === 'DOCTOR'
              ? u.doctorId !== id
              : u.role === 'NURSE'
                ? u.department?.status !== 'ACTIVE' ||
                  u.department.id !== d.department.id
                : u.role !== 'STAFF'
          )
            return deny();
        }
        return u;
      }
      async function ready(
        id?: string,
        write = false,
        signal?: AbortSignal,
        saving = write,
      ) {
        const u = await auth(id, write);
        const sig = `${u.id}:${u.role}:${u.doctorId}:${u.department?.id}`;
        await source.wait(signal, saving);
        const after = await auth(id, write);
        if (
          sig !==
          `${after.id}:${after.role}:${after.doctorId}:${after.department?.id}`
        )
          return deny();
        return after;
      }
      return {
        async availability(id, signal) {
          await ready(id, false, signal);
          return { doctorId: id, intervalMinutes: 20, weeklySlots: slots(id) };
        },
        async leaves(id, from, to, signal) {
          await ready(id, false, signal);
          range(from, to);
          return off(id).filter((l) => l.date >= from && l.date <= to);
        },
        async save(input) {
          const u = await ready(undefined, true);
          let normalized: WeeklySlot[];
          try {
            normalized = normalizedSlots(input);
          } catch (e) {
            throw new ApiError('VALIDATION_ERROR', (e as Error).message, 400);
          }
          if (
            source.appointments.some(
              (a) =>
                a.doctor.id === u.doctorId &&
                a.status === 'BOOKED' &&
                Date.parse(a.startsAt) > Date.now() &&
                !includesSlot(
                  normalized,
                  weekday(a.startsAt.slice(0, 10)),
                  a.startsAt.slice(11, 16),
                ),
            )
          )
            throw new ApiError(
              'AVAILABILITY_CONFLICT',
              '미래 예약과 충돌하여 저장하지 않았습니다. 입력 내용은 유지됩니다.',
              409,
            );
          times.set(u.doctorId!, normalized);
          return {
            doctorId: u.doctorId!,
            intervalMinutes: 20,
            weeklySlots: slots(u.doctorId!),
          };
        },
        async leave(date) {
          const u = await ready(undefined, true);
          range(date, date);
          if (
            source.appointments.some(
              (a) =>
                a.doctor.id === u.doctorId &&
                a.status !== 'CANCELLED' &&
                a.startsAt.slice(0, 10) === date,
            )
          )
            throw new ApiError(
              'LEAVE_HAS_BOOKING',
              '예약이 있는 날짜는 휴진할 수 없습니다.',
              409,
            );
          if (off(u.doctorId!).some((l) => l.date === date))
            throw new ApiError(
              'CONFLICT',
              '이미 휴진으로 등록된 날짜입니다.',
              409,
            );
          const l = { date };
          leaves.set(u.doctorId!, [...off(u.doctorId!), l]);
          return structuredClone(l);
        },
        async schedule(from, to, signal) {
          const u = await ready(undefined, true, signal, false);
          range(from, to);
          const rows = receptionRows().filter(
            (r) =>
              r.doctor.id === u.doctorId &&
              r.receivedAt.slice(0, 10) >= from &&
              r.receivedAt.slice(0, 10) <= to,
          );
          return {
            from,
            to,
            availability: slots(u.doctorId!),
            leaves: off(u.doctorId!).filter(
              (l) => l.date >= from && l.date <= to,
            ),
            appointments: source.appointments
              .filter(
                (a) =>
                  a.doctor.id === u.doctorId &&
                  a.startsAt.slice(0, 10) >= from &&
                  a.startsAt.slice(0, 10) <= to,
              )
              .map((a) =>
                nurseAppointment({
                  ...(source.projectAppointment?.(a) ?? a),
                  receptionId:
                    rows.find((r) => r.appointmentId === a.id)?.id ?? null,
                  displayStatus:
                    a.status === 'CANCELLED'
                      ? 'CANCELLED'
                      : (rows.find((r) => r.appointmentId === a.id)
                          ?.displayStatus ?? 'BOOKED'),
                }),
              ),
            receptions: rows.map((r) => ({
              ...r,
              patient: nursePatient(r.patient),
            })),
            visits: rows.flatMap((r) => {
              const v = r.visitId && visit(r.visitId);
              return v
                ? [v]
                : r.visitId && r.visitStatus
                  ? [
                      {
                        id: r.visitId,
                        receptionId: r.id,
                        patient: nursePatient(r.patient),
                        department: r.department,
                        doctor: r.doctor,
                        status: r.visitStatus,
                        startedAt: r.receivedAt,
                      },
                    ]
                  : [];
            }),
          };
        },
      };
    },
  };
}
