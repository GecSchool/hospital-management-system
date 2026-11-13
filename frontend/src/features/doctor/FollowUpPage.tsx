import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import type { StaffService } from '../staff/staffService';
import { staffService } from '../staff/service';
import { queryKeys } from '../../services/api/queryKeys';
import { PageHeader } from '../../components/layout';
import { Button, Input, Modal } from '../../components/ui';
import { ErrorState, Loading } from '../../components/common';
import {
  businessDate,
  dateLabel,
  dateTimeLabel,
  longDateLabel,
} from '../staff/format';
import { slotReason } from '../appointments/queries';
import { useClinicalWrite } from './clinicalWrite';
import type { Visit } from '../nurse/service';
import type { ClinicalService } from './clinicalService';
import type { NurseAppointment } from '../nurse/bookingService';
import '../appointments/appointments.css';
import './doctor.css';
export function FollowUpPage({
  service = staffService,
}: {
  service?: StaffService;
}) {
  const { user } = useAuth();
  const { visitId } = useParams();
  return (
    <Session
      key={`${user!.id}:${user!.doctorId}:${visitId}`}
      source={service}
    />
  );
}
function Session({ source }: { source: StaffService }) {
  const { user } = useAuth();
  const principal = useRef(user);
  principal.current = user;
  useEffect(() => {
    principal.current = user;
    return () => {
      principal.current = null;
    };
  }, [user]);
  const service = useMemo(
    () => source.clinical(async () => principal.current),
    [source],
  );
  const { visitId } = useParams();
  const visit = useQuery({
    queryKey: [
      ...queryKeys.resource(user!.id, 'doctor-clinical'),
      user!.doctorId,
      'visit',
      visitId,
    ],
    queryFn: ({ signal }) => service.visit(visitId!, signal),
    gcTime: 0,
  });
  return (
    <section
      className="doctor-page appointment-form"
      data-figma-node="101:2663"
    >
      <nav className="doctor-breadcrumb" aria-label="현재 위치">
        <Link to="/doctor/patients">환자 진료</Link>
        <span>/</span>
        <span>재진 예약</span>
      </nav>
      <PageHeader
        title="재진 예약"
        description="재진할 날짜와 시간을 선택합니다."
      />
      {visit.isPending ? (
        <Loading />
      ) : visit.isError ? (
        <ErrorState
          message={visit.error.message}
          onRetry={() => void visit.refetch()}
        />
      ) : visit.data.status !== 'COMPLETED' ? (
        <p role="alert">완료된 진료에서만 재진 예약할 수 있습니다.</p>
      ) : (
        <FollowUpForm visit={visit.data} service={service} />
      )}
    </section>
  );
}
function FollowUpForm({
  visit,
  service,
}: {
  visit: Visit;
  service: ClinicalService;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const returnToVisit = () =>
    navigate(`/doctor/visits/${encodeURIComponent(visit.id)}`, {
      state: { notice: '재진 예약이 완료되었습니다.' },
    });
  const [date, setDate] = useState(businessDate());
  const [time, setTime] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState<NurseAppointment | null>(null);
  const write = useClinicalWrite();
  const slots = useQuery({
    queryKey: [
      ...queryKeys.resource(user!.id, 'staff-appointments'),
      'follow-up-slots',
      user!.doctorId,
      visit.id,
      date,
    ],
    queryFn: ({ signal }) => service.followUpSlots(visit.id, date, signal),
  });
  const available =
    !!slots.data?.slots.some((s) => s.startsAt === time && s.available) &&
    !slots.isFetching &&
    !slots.isError;
  const success = saved ? (
    <Modal
      open
      title="재진 예약이 완료되었습니다"
      onClose={returnToVisit}
      footer={<Button onClick={returnToVisit}>확인</Button>}
    >
      <p role="status">재진 예약이 완료되었습니다.</p>
      <p>
        {saved.patient.name} · {saved.department.name} · {saved.doctor.name}
      </p>
      <p>{dateTimeLabel(saved.startsAt)}</p>
      <Link
        className="clinical-link"
        to={`/doctor/schedule/day?date=${saved.startsAt.slice(0, 10)}`}
      >
        예약한 날짜 일정 보기
      </Link>
      <Link
        className="clinical-link"
        to={`/doctor/visits/${encodeURIComponent(visit.id)}`}
      >
        완료 기록으로
      </Link>
    </Modal>
  ) : null;
  return (
    <>
      <div className="appointment-columns">
        <section className="appointment-fields">
          <h2>예약 정보</h2>
          <label>
            환자
            <Input
              readOnly
              value={`${visit.patient.name} · ${visit.patient.birthDate ? dateLabel(visit.patient.birthDate) : '—'}`}
            />
          </label>
          <label>
            진료과
            <Input readOnly value={visit.department.name} />
          </label>
          <label>
            담당 의사
            <Input readOnly value={visit.doctor.name} />
          </label>
          <label>
            진료 날짜
            <Input
              type="date"
              value={date}
              min={businessDate()}
              disabled={write.pending || !!saved}
              onChange={(e) => {
                setDate(e.target.value);
                setTime('');
              }}
            />
          </label>
        </section>
        <section className="appointment-times">
          <h2>진료 시간 선택</h2>
          <p className="appointment-date">
            {date ? longDateLabel(date) : '날짜를 선택해 주세요.'}
          </p>
          {slots.isPending ? (
            <Loading />
          ) : slots.isError ? (
            <ErrorState
              message={slots.error.message}
              onRetry={() => {
                setTime('');
                void slots.refetch();
              }}
            />
          ) : !slots.data.slots.length ? (
            <p>예약 가능한 시간대가 없습니다.</p>
          ) : (
            <div className="appointment-slot-grid" aria-label="재진 예약 시간">
              {slots.data.slots.map((s) => (
                <button
                  type="button"
                  key={s.startsAt}
                  aria-label={`${s.startsAt.slice(11, 16)}${s.available ? '' : ` · ${slotReason(s.reason)}`}`}
                  title={s.available ? '예약 가능' : slotReason(s.reason)}
                  aria-pressed={time === s.startsAt}
                  disabled={
                    !s.available || write.pending || !!saved || slots.isFetching
                  }
                  onClick={() => setTime(s.startsAt)}
                >
                  {s.startsAt.slice(11, 16)}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
      {write.error && !confirm && <p role="alert">{write.error}</p>}
      <footer className="appointment-footer">
        <Link
          className="ui-button ui-button--secondary"
          to={`/doctor/visits/${encodeURIComponent(visit.id)}`}
        >
          취소
        </Link>
        <Button
          disabled={!available || write.pending || !!saved}
          onClick={() => setConfirm(true)}
        >
          예약 등록
        </Button>
      </footer>
      {confirm && (
        <Modal
          open
          title="재진 예약을 등록할까요?"
          onClose={() => {
            if (!write.pending) setConfirm(false);
          }}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={write.pending || !!saved}
                onClick={() => setConfirm(false)}
              >
                돌아가기
              </Button>
              <Button
                disabled={write.pending || !available}
                onClick={() =>
                  void write.run(
                    () => service.followUp(visit.id, time),
                    (result) => {
                      setConfirm(false);
                      setSaved(result);
                    },
                  )
                }
              >
                {write.pending ? '등록 중…' : '등록 확정'}
              </Button>
            </>
          }
        >
          <p>
            {visit.patient.name} · {visit.department.name} · {visit.doctor.name}
          </p>
          <p>{dateTimeLabel(time)}</p>
          {write.error && (
            <>
              <p role="alert">{write.error}</p>
              <Button
                variant="secondary"
                disabled={write.pending || slots.isFetching}
                onClick={() => {
                  setConfirm(false);
                  setTime('');
                  void slots.refetch();
                }}
              >
                시간대 다시 조회
              </Button>
            </>
          )}
        </Modal>
      )}
      {success}
    </>
  );
}
