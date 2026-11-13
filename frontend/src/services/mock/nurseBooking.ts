import { ApiError } from '../api/errors';
import type { StaffService } from '../../features/staff/staffService';
import type { Principal } from '../../features/nurse/service';
import {
  nurseAppointment,
  nursePatient,
  type NurseBooking,
} from '../../features/nurse/bookingService';
import type { AppointmentInput } from '../../features/appointments/service';
import type { StaffAppointment } from '../../features/staff/types';
/** DEVELOPMENT ONLY: same central repositories, live session authorization. */
export function scopedNurseBooking(
  s: StaffService,
  principal: Principal,
  create: (input: AppointmentInput) => Promise<StaffAppointment>,
): NurseBooking {
  const forbidden = () => {
    throw new ApiError(
      'FORBIDDEN',
      '본인 진료과 예약만 이용할 수 있습니다.',
      403,
    );
  };
  async function user() {
    const u = await principal();
    if (
      !u ||
      u.role !== 'NURSE' ||
      u.status !== 'ACTIVE' ||
      u.department?.status !== 'ACTIVE'
    )
      return forbidden();
    return u;
  }
  async function run<T>(work: (dep: string) => Promise<T>) {
    const u = await user();
    const signature = `${u.id}:${u.department!.id}`;
    const result = await work(u.department!.id);
    const after = await user();
    if (signature !== `${after.id}:${after.department!.id}`) return forbidden();
    return result;
  }
  const doctors = (dep: string, signal?: AbortSignal) =>
    run(async (own) => {
      if (dep !== own) return forbidden();
      return s.booking.doctors(own, signal);
    });
  return {
    async list(f, p, signal) {
      return run(async () => {
        if ('patientNumber' in f) return forbidden();
        const r = await s.list(f, p, signal);
        return { ...r, data: r.data.map(nursePatient) };
      });
    },
    async detail(id, signal) {
      return run(async () => nursePatient(await s.detail(id, signal)));
    },
    booking: {
      departments: (signal) =>
        run(async (dep) =>
          (await s.booking.departments(signal)).filter(
            (d) => d.id === dep && d.status === 'ACTIVE',
          ),
        ),
      doctors,
      async availability(id, signal) {
        return run(async (dep) => {
          if (!(await s.booking.doctors(dep, signal)).some((d) => d.id === id))
            return forbidden();
          return s.booking.availability(id, signal);
        });
      },
      async slots(id, date, exclude, signal) {
        if (exclude) return forbidden();
        return run(async (dep) => {
          if (!(await s.booking.doctors(dep, signal)).some((d) => d.id === id))
            return forbidden();
          return s.booking.slots(id, date, undefined, signal);
        });
      },
      list: (f, p, signal) =>
        run(async (dep) => {
          if (f.departmentId && f.departmentId !== dep) return forbidden();
          const r = await s.booking.list(
            { ...f, departmentId: dep },
            p,
            signal,
          );
          return { ...r, data: r.data.map(nurseAppointment) };
        }),
      detail: (id, signal) =>
        run(async (dep) => {
          const a = await s.booking.detail(id, signal);
          if (a.department.id !== dep) return forbidden();
          return nurseAppointment(a);
        }),
      create: (input) =>
        run(async (dep) => {
          if (input.departmentId !== dep) return forbidden();
          return nurseAppointment(await create(input));
        }),
      async reschedule() {
        return forbidden();
      },
      async cancel() {
        return forbidden();
      },
    },
  };
}
