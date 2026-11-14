import { StaffContext } from '../staff/StaffContext';
import type { NurseBooking } from '../nurse/bookingService';
import type { StaffService } from '../staff/staffService';
import { useContext, useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Button, Input, Select, Modal, Pagination } from '../../components/ui';
import { ErrorState, Loading } from '../../components/common';
import { PageHeader } from '../../components/layout';
import { useAuth } from '../auth/useAuth';
import { useStaff } from '../staff/useStaff';
import { staffKeys } from '../staff/queries';
import { businessDate, dateTimeLabel, longDateLabel } from '../staff/format';
import type { StaffAppointment, StaffPatientSummary } from '../staff/types';
import {
  bookingKey,
  bookingError,
  slotReason,
  useBookingWrite,
} from './queries';
import { MockStaffControls } from '../staff/MockStaffControls';
import './appointments.css';
export function AppointmentFormPage() {
  const { appointmentId } = useParams();
  const { service } = useStaff();
  const { user } = useAuth();
  const query = useQuery({
    queryKey: [...bookingKey(user!.id), 'detail', appointmentId],
    queryFn: ({ signal }) => service.booking.detail(appointmentId!, signal),
    enabled: !!appointmentId,
  });
  if (appointmentId && query.isPending) return <Loading />;
  if (appointmentId && query.isError)
    return (
      <>
        <ErrorState
          message={bookingError(query.error)}
          onRetry={() => void query.refetch()}
        />
        <MockStaffControls />
      </>
    );
  return (
    <AppointmentForm key={appointmentId ?? 'new'} appointment={query.data} />
  );
}
export function AppointmentForm({
  appointment,
  source,
}: {
  appointment?: StaffAppointment;
  source?: NurseBooking;
}) {
  const context = useContext(StaffContext);
  const service:
    Pick<StaffService, 'booking' | 'list' | 'detail'> | NurseBooking =
    source ?? context!.service;
  const nurse = !!source;
  const home = nurse ? '/nurse' : '/staff';
  const { user } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const scope = useId();
  const write = useBookingWrite();
  const selectedId: unknown =
    useParams().patientId ?? location.state?.patientId;
  const [patient, setPatient] = useState<
    | StaffPatientSummary
    | import('../nurse/bookingService').NursePatient
    | undefined
  >(
    () =>
      appointment?.patient ??
      (nurse && typeof selectedId === 'string'
        ? queryClient.getQueryData<
            import('../nurse/bookingService').NursePatient
          >(staffKeys.detail(user!.id, selectedId))
        : undefined),
  );
  const initial = useQuery({
    queryKey: staffKeys.detail(
      user!.id,
      typeof selectedId === 'string' ? selectedId : '',
    ),
    queryFn: ({ signal }) => service.detail(selectedId as string, signal),
    enabled: !nurse && !appointment && typeof selectedId === 'string',
  });
  const selected = patient ?? initial.data;
  const [departmentId, setDepartment] = useState(
    appointment?.department.id ?? (nurse ? user!.department!.id : ''),
  );
  const [doctorId, setDoctor] = useState(appointment?.doctor.id ?? '');
  const [date, setDate] = useState(
    appointment?.startsAt.slice(0, 10) ?? businessDate(),
  );
  const [time, setTime] = useState(appointment?.startsAt ?? '');
  const [finding, setFinding] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [validation, setValidation] = useState('');
  const departments = useQuery({
    queryKey: [...bookingKey(user!.id), 'departments'],
    queryFn: ({ signal }) => service.booking.departments(signal),
  });
  const doctors = useQuery({
    queryKey: [...bookingKey(user!.id), 'doctors', departmentId],
    queryFn: ({ signal }) => service.booking.doctors(departmentId, signal),
    enabled: !!departmentId,
  });
  const availability = useQuery({
    queryKey: [...bookingKey(user!.id), 'availability', doctorId],
    queryFn: ({ signal }) => service.booking.availability(doctorId, signal),
    enabled: !!doctorId,
  });
  const slots = useQuery({
    queryKey: [
      ...bookingKey(user!.id),
      'slots',
      doctorId,
      date,
      appointment?.id,
    ],
    queryFn: ({ signal }) =>
      service.booking.slots(doctorId, date, appointment?.id, signal),
    enabled: !!doctorId && !!date,
  });
  const blocked =
    !!appointment &&
    (appointment.status === 'CANCELLED' ||
      !!appointment.receptionId ||
      appointment.displayStatus !== 'BOOKED');
  const available =
    slots.data?.slots.some((s) => s.startsAt === time && s.available) &&
    !slots.isFetching &&
    !slots.isError;
  const disabled =
    write.pending ||
    blocked ||
    !selected ||
    !departmentId ||
    !doctorId ||
    !available ||
    appointment?.startsAt === time;
  const close = () =>
    nurse
      ? navigate('/nurse/appointments')
      : navigate(
          appointment
            ? `/staff/appointments/${encodeURIComponent(appointment.id)}`
            : selected
              ? `/staff/patients/${encodeURIComponent(selected.id)}`
              : `${home}/appointments/new`,
        );
  function submit() {
    if (disabled) {
      setValidation('환자, 진료과, 의사와 예약 가능한 시간을 선택해 주세요.');
      return;
    }
    setValidation('');
    setConfirm(true);
  }
  const department =
    departments.data?.find((d) => d.id === departmentId) ??
    appointment?.department;
  const doctor =
    doctors.data?.find((d) => d.id === doctorId) ?? appointment?.doctor;
  return (
    <section
      className="staff-page appointment-form"
      data-figma-node={nurse ? '100:399' : appointment ? '68:1656' : '26:436'}
    >
      <nav className="staff-breadcrumb">
        <Link to={`${home}/appointments`}>진료 예약</Link> /{' '}
        {appointment ? '예약 시간 변경' : '예약 등록'}
      </nav>
      <PageHeader
        title={appointment ? '예약 시간 변경' : '예약 등록'}
        description={
          appointment
            ? `기존 예약 · ${dateTimeLabel(appointment.startsAt)}`
            : '진료과, 담당 의사와 예약 시간을 선택합니다.'
        }
      />
      {blocked && (
        <p role="alert">취소되었거나 접수된 예약은 변경할 수 없습니다.</p>
      )}
      <div className="appointment-columns">
        <section className="appointment-fields">
          <h2>예약 정보</h2>
          <label>
            환자
            <Input
              readOnly
              value={
                selected
                  ? `${selected.name} · ${nurse ? selected.birthDate : 'patientNumber' in selected ? String(selected.patientNumber) : ''}`
                  : ''
              }
              placeholder="환자를 선택해 주세요."
            />
          </label>
          {!appointment && !nurse && (
            <Button
              variant="secondary"
              size="compact"
              onClick={() => setFinding(true)}
              disabled={write.pending}
            >
              환자 찾기
            </Button>
          )}
          {initial.isError && (
            <ErrorState
              message={bookingError(initial.error)}
              onRetry={() => void initial.refetch()}
            />
          )}
          {nurse && !selected && (
            <p role="alert">
              환자를 다시 선택해 주세요.{' '}
              <Link to="/nurse/appointments/new">환자 검색</Link>
            </p>
          )}
          <label>
            진료과
            <Select
              value={departmentId}
              disabled={nurse || !!appointment || write.pending}
              onChange={(e) => {
                setDepartment(e.target.value);
                setDoctor('');
                setTime('');
              }}
            >
              <option value="">진료과 선택</option>
              {departments.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            담당 의사
            <Select
              value={doctorId}
              disabled={!!appointment || !departmentId || write.pending}
              onChange={(e) => {
                setDoctor(e.target.value);
                setTime('');
              }}
            >
              <option value="">담당 의사 선택</option>
              {doctors.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </label>
          {(departments.isError || doctors.isError) && (
            <ErrorState
              message="진료과·의사를 불러오지 못했습니다."
              onRetry={() => {
                void departments.refetch();
                if (departmentId) void doctors.refetch();
              }}
            />
          )}
          <label>
            진료 날짜
            <Input
              type="date"
              min={businessDate()}
              value={date}
              disabled={write.pending || blocked}
              onChange={(e) => {
                setDate(e.target.value);
                setTime('');
              }}
            />
          </label>
        </section>
        <section className="appointment-times">
          <h2>진료 시간 선택</h2>
          {!doctorId || !date ? (
            <p>의사와 진료 날짜를 선택해 주세요.</p>
          ) : (
            <>
              <p className="appointment-date">{longDateLabel(date)}</p>
              {slots.isPending ? (
                <Loading />
              ) : slots.isError ? (
                <ErrorState
                  message={bookingError(slots.error)}
                  onRetry={() => {
                    setTime('');
                    void slots.refetch();
                  }}
                />
              ) : slots.data.slots.length === 0 ? (
                <p>예약 가능한 시간대가 없습니다.</p>
              ) : (
                <div className="appointment-slot-grid" aria-label="예약 시간">
                  {slots.data.slots.map((s) => (
                    <button
                      type="button"
                      key={s.startsAt}
                      aria-pressed={time === s.startsAt}
                      disabled={
                        !s.available ||
                        blocked ||
                        write.pending ||
                        slots.isFetching
                      }
                      title={s.available ? '예약 가능' : slotReason(s.reason)}
                      aria-label={`${s.startsAt.slice(11, 16)}${s.available ? '' : ` · ${slotReason(s.reason)}`}`}
                      onClick={() => setTime(s.startsAt)}
                    >
                      {s.startsAt.slice(11, 16)}
                    </button>
                  ))}
                </div>
              )}
              {slots.isFetching && !slots.isPending && (
                <p role="status">시간대를 갱신하고 있습니다.</p>
              )}
              <p className="appointment-help">
                흐린 시간은 예약할 수 없습니다. 선택 시점 이후에도 예약 상황은
                달라질 수 있습니다.
              </p>
              {slots.data && (
                <p className="appointment-help">
                  예약 불가 사유:{' '}
                  {[
                    ...new Set(
                      slots.data.slots
                        .filter((s) => !s.available)
                        .map((s) => slotReason(s.reason)),
                    ),
                  ].join(' · ') || '없음'}
                </p>
              )}
              {availability.isError && (
                <ErrorState
                  message="진료 가능 시간 안내를 불러오지 못했습니다."
                  onRetry={() => void availability.refetch()}
                />
              )}
            </>
          )}
        </section>
      </div>
      {validation && <p role="alert">{validation}</p>}
      {write.error && !confirm && <p role="alert">{write.error}</p>}
      <footer className="appointment-footer">
        <Button variant="secondary" disabled={write.pending} onClick={close}>
          취소
        </Button>
        <Button disabled={disabled} onClick={submit}>
          {appointment ? '변경 저장' : '예약 등록'}
        </Button>
      </footer>
      {finding && (
        <PatientPicker
          scope={scope}
          onClose={() => setFinding(false)}
          onSelect={(p) => {
            setPatient(p);
            setFinding(false);
          }}
        />
      )}
      {confirm && (
        <Modal
          open
          title={
            appointment
              ? '예약 시간을 변경할까요?'
              : '예약 내용을 확인해 주세요.'
          }
          onClose={() => {
            if (!write.pending) setConfirm(false);
          }}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={write.pending}
                onClick={() => setConfirm(false)}
              >
                돌아가기
              </Button>
              <Button
                disabled={write.pending}
                onClick={() =>
                  void write.run(
                    () =>
                      appointment
                        ? service.booking.reschedule(appointment.id, time)
                        : service.booking.create({
                            patientId: selected!.id,
                            departmentId,
                            doctorId,
                            startsAt: time,
                          }),
                    () =>
                      navigate(`${home}/appointments`, {
                        state: {
                          notice: appointment
                            ? '예약 시간이 변경되었습니다.'
                            : '예약이 등록되었습니다.',
                        },
                      }),
                  )
                }
              >
                {write.pending
                  ? '처리 중…'
                  : appointment
                    ? '변경 확정'
                    : '등록 확정'}
              </Button>
            </>
          }
        >
          <p>
            {selected?.name} ·{' '}
            {nurse
              ? selected?.birthDate
              : selected && 'patientNumber' in selected
                ? String(selected.patientNumber)
                : ''}
          </p>
          <p>
            {department?.name} · {doctor?.name}
          </p>
          <p>{dateTimeLabel(time)}</p>
          {write.error && <p role="alert">{write.error}</p>}
        </Modal>
      )}
      {!nurse && <MockStaffControls />}
    </section>
  );
}
function PatientPicker({
  scope,
  onClose,
  onSelect,
}: {
  scope: string;
  onClose(): void;
  onSelect(p: StaffPatientSummary): void;
}) {
  const { service } = useStaff();
  const { user } = useAuth();
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState({ name: '', revision: 0 });
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [
      ...staffKeys.patients(user!.id),
      'booking-picker',
      scope,
      search.revision,
      page,
    ],
    queryFn: ({ signal }) =>
      service.list({ name: search.name }, { page, size: 5 }, signal),
  });
  return (
    <Modal
      open
      title="환자 선택"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearch((p) => ({ name: draft.trim(), revision: p.revision + 1 }));
          setPage(1);
        }}
      >
        <label>
          환자명 검색
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} />
        </label>
        <Button type="submit">검색</Button>
      </form>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState
          message={bookingError(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <ul className="appointment-patient-results">
            {query.data.data.map((p) => (
              <li key={p.id}>
                <Button variant="secondary" onClick={() => onSelect(p)}>
                  {p.name} · {p.patientNumber}
                </Button>
              </li>
            ))}
          </ul>
          {!query.data.data.length && <p>검색 결과가 없습니다.</p>}
          <Pagination
            page={page}
            totalPages={query.data.meta.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </Modal>
  );
}
