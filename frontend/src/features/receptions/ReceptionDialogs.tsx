import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, FormField, Modal, Select } from '../../components/ui';
import { ErrorState, Loading } from '../../components/common';
import { useAuth } from '../auth/useAuth';
import { useStaff } from '../staff/useStaff';
import { bookingKey, useBookingWrite } from '../appointments/queries';
import { dateTimeLabel } from '../staff/format';
import type {
  StaffAppointment,
  StaffPatientSummary,
  StaffReception,
} from '../staff/types';
import { receptionEligibility } from './queries';
import './receptions.css';
export function AppointmentCheckIn({
  appointment,
  onClose,
  onSaved,
}: {
  appointment: StaffAppointment;
  onClose(): void;
  onSaved(row: StaffReception): void;
}) {
  const { service } = useStaff();
  const write = useBookingWrite();
  const reason = receptionEligibility(appointment);
  return (
    <Modal
      open
      className="reception-confirm"
      title="예약 환자를 접수할까요?"
      description={`${appointment.patient.name} · ${appointment.department.name} · ${appointment.doctor.name}`}
      onClose={() => {
        if (!write.pending) onClose();
      }}
      footer={
        <>
          <Button
            variant="secondary"
            disabled={write.pending}
            onClick={onClose}
          >
            취소
          </Button>
          <Button
            disabled={write.pending || !!reason}
            onClick={() => {
              let saved: StaffReception;
              void write.run(
                async () => {
                  saved = await service.intake.create({
                    appointmentId: appointment.id,
                  });
                },
                () => onSaved(saved),
              );
            }}
          >
            {write.pending ? '접수 중…' : '접수'}
          </Button>
        </>
      }
    >
      <p>{dateTimeLabel(appointment.startsAt)}</p>
      {reason && <p role="alert">{reason}</p>}
      {write.error && <p role="alert">{write.error}</p>}
    </Modal>
  );
}
export function WalkInDialog({
  patient,
  onClose,
  onSaved,
}: {
  patient: StaffPatientSummary;
  onClose(): void;
  onSaved(row: StaffReception): void;
}) {
  const { service } = useStaff();
  const { user } = useAuth();
  const write = useBookingWrite();
  const [departmentId, setDepartment] = useState('');
  const [doctorId, setDoctor] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const departments = useQuery({
    queryKey: [...bookingKey(user!.id), 'departments'],
    queryFn: ({ signal }) => service.booking.departments(signal),
  });
  const doctors = useQuery({
    queryKey: [...bookingKey(user!.id), 'doctors', departmentId],
    queryFn: ({ signal }) => service.booking.doctors(departmentId, signal),
    enabled: !!departmentId,
  });
  function submit() {
    setSubmitted(true);
    if (
      !departmentId ||
      !doctorId ||
      !doctors.data?.some((d) => d.id === doctorId) ||
      write.pending
    )
      return;
    let saved: StaffReception;
    void write.run(
      async () => {
        saved = await service.intake.create({
          patientId: patient.id,
          departmentId,
          doctorId,
        });
      },
      () => onSaved(saved),
    );
  }
  return (
    <Modal
      open
      className="reception-walkin"
      title="현장 접수"
      description={`${patient.name} · ${patient.patientNumber}`}
      onClose={() => {
        if (!write.pending) onClose();
      }}
      footer={
        <>
          <Button
            variant="secondary"
            disabled={write.pending}
            onClick={onClose}
          >
            취소
          </Button>
          <Button disabled={write.pending} onClick={submit}>
            {write.pending ? '접수 중…' : '접수'}
          </Button>
        </>
      }
    >
      <FormField
        id="walkin-department"
        label="진료과"
        error={
          submitted && !departmentId ? '진료과를 선택해 주세요.' : undefined
        }
      >
        <Select
          id="walkin-department"
          value={departmentId}
          disabled={write.pending}
          onChange={(e) => {
            setDepartment(e.target.value);
            setDoctor('');
          }}
        >
          <option value="">진료과 선택</option>
          {departments.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField
        id="walkin-doctor"
        label="담당 의사"
        error={
          submitted && !doctorId ? '담당 의사를 선택해 주세요.' : undefined
        }
      >
        <Select
          id="walkin-doctor"
          value={doctorId}
          disabled={write.pending || !departmentId || doctors.isFetching}
          onChange={(e) => setDoctor(e.target.value)}
        >
          <option value="">담당 의사 선택</option>
          {doctors.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </FormField>
      {(departments.isPending || (departmentId && doctors.isPending)) && (
        <Loading />
      )}
      {(departments.isError || doctors.isError) && (
        <ErrorState
          message="진료과·의사 정보를 불러오지 못했습니다."
          onRetry={() => {
            void departments.refetch();
            if (departmentId) void doctors.refetch();
          }}
        />
      )}
      {write.error && <p role="alert">{write.error}</p>}
    </Modal>
  );
}
