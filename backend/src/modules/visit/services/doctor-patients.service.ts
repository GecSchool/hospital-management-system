import type { AccountContext } from '../../../common/middlewares/auth.js';
import type { DoctorPatientsQuery } from '../validations/doctor-patients.validation.js';
import { AppError } from '../../../common/errors/index.js';
import { getPrismaClient } from '../../../config/prisma.js';
import { receptionDisplayStatus } from '../../reception/services/reception-query.service.js';
// VIS-01: 선택 날짜와 담당 의사에 해당하는 예약 및 접수를 한 행으로 합쳐 화면 상태로 필터한다.
// 미접수 예약은 예약 시각, 접수는 접수 시각을 사용하며 한국 시간 기준으로 날짜를 판별한다.
export async function listDoctorPatients(actor: AccountContext, query: DoctorPatientsQuery) {
  if (actor.role !== 'DOCTOR') throw new AppError(403, 'FORBIDDEN', '의사 권한이 필요합니다.');
  const start = new Date(`${query.date}T00:00:00+09:00`);
  const time = { gte: start, lt: new Date(start.getTime() + 86400000) };
  const patientSelect = { id: true, name: true, birthDate: true, phone: true } as const;
  const db = getPrismaClient();
  const [appointments, receptions] = await Promise.all([
    db.appointment.findMany({
      where: { doctorAccountId: actor.id, startsAt: time, reception: { is: null } },
      select: { id: true, startsAt: true, status: true, patient: { select: patientSelect } },
    }),
    db.reception.findMany({
      where: { doctorAccountId: actor.id, receivedAt: time },
      select: {
        id: true,
        appointmentId: true,
        receivedAt: true,
        status: true,
        patient: { select: patientSelect },
        visit: { select: { id: true, status: true, clinicalRecord: { select: { id: true } } } },
      },
    }),
  ]);
  const formatPatient = (p: { id: string; name: string; birthDate: Date; phone: string }) => ({
    ...p,
    birthDate: p.birthDate.toISOString().slice(0, 10),
  });
  const rows = [
    ...appointments.map((a) => ({
      patient: formatPatient(a.patient),
      appointmentId: a.id,
      receptionId: null,
      visitId: null,
      clinicalRecordId: null,
      displayStatus: a.status,
      displayTime: a.startsAt.toISOString(),
    })),
    ...receptions.map((r) => ({
      patient: formatPatient(r.patient),
      appointmentId: r.appointmentId,
      receptionId: r.id,
      visitId: r.visit?.id ?? null,
      clinicalRecordId: r.visit?.clinicalRecord?.id ?? null,
      displayStatus: receptionDisplayStatus(r.status, r.visit),
      displayTime: r.receivedAt.toISOString(),
    })),
  ];
  return rows
    .filter((row) => !query.status || row.displayStatus === query.status)
    .sort(
      (a, b) =>
        a.displayTime.localeCompare(b.displayTime) ||
        (a.receptionId ?? a.appointmentId ?? '').localeCompare(
          b.receptionId ?? b.appointmentId ?? '',
        ),
    );
}
