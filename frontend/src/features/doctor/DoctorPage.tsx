import { CurrentTime } from './CurrentTime';
import { SchedulePatientPicker } from './SchedulePatientPicker';
import { normalizeDate } from '../staff/validation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useSearchParams } from 'react-router';
import { staffService } from '../staff/service';
import type { StaffService } from '../staff/staffService';
import { useAuth } from '../auth/useAuth';
import { queryKeys } from '../../services/api/queryKeys';
import { useBookingWrite } from '../appointments/queries';
import { PageHeader } from '../../components/layout';
import { Button, Input, Modal } from '../../components/ui';
import { ErrorState, Loading } from '../../components/common';
import {
  businessDate,
  dateLabel,
  dateTimeLabel,
  longDateLabel,
  statusLabels,
} from '../staff/format';
import {
  clock,
  includesSlot,
  minutes,
  normalizedSlots,
  scheduleItems,
  shiftDate,
  weekday,
} from './schedule';
import type { Availability } from '../appointments/service';
import './doctor.css';
const days = [1, 2, 3, 4, 5, 6, 0];
const names = ['일', '월', '화', '수', '목', '금', '토'];
export function DoctorPage({
  service = staffService,
}: {
  service?: StaffService;
}) {
  const { user } = useAuth();
  return <Session key={`${user!.id}:${user!.doctorId}`} source={service} />;
}
function Session({ source }: { source: StaffService }) {
  const { user } = useAuth();
  const current = useRef(user);
  current.current = user;
  useEffect(() => {
    current.current = user;
    return () => {
      current.current = null;
    };
  }, [user]);
  const service = useMemo(
    () => source.doctor(async () => current.current),
    [source],
  );
  const table = useRef<HTMLTableElement>(null);
  const [patientOptions, setPatientOptions] = useState<
    ReturnType<typeof scheduleItems>
  >([]);
  const client = useQueryClient();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [notice, setNotice] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(false);
  const date = normalizeDate(params.get('date') ?? '') ?? businessDate();
  const dayView = location.pathname.endsWith('/day');
  const editing = location.pathname.endsWith('/availability');
  const from = dayView ? date : shiftDate(date, -((weekday(date) + 6) % 7));
  const to = dayView ? date : shiftDate(from, 6);
  const base = [
    ...queryKeys.resource(user!.id, 'doctor-schedule'),
    user!.doctorId,
  ];
  const schedule = useQuery({
    queryKey: [...base, 'range', from, to],
    queryFn: ({ signal }) => service.schedule(from, to, signal),
    enabled: !editing,
  });
  const availability = useQuery({
    queryKey: [...base, 'availability'],
    queryFn: ({ signal }) => service.availability(user!.doctorId!, signal),
    enabled: editing,
  });
  const leaves = useQuery({
    queryKey: [...base, 'leaves', from, to],
    queryFn: ({ signal }) => service.leaves(user!.doctorId!, from, to, signal),
    enabled: !editing,
  });
  const allItems = useMemo(
    () => (schedule.data ? scheduleItems(schedule.data) : []),
    [schedule.data],
  );
  const write = useBookingWrite();
  useEffect(() => {
    if (editing && write.error && !write.pending) setAvailabilityError(true);
  }, [editing, write.error, write.pending]);
  async function refresh() {
    await client.cancelQueries({ queryKey: base });
    await client.invalidateQueries({ queryKey: base });
  }
  const setDate = (value: string) => {
    if (value) setParams({ date: value });
  };
  const query = editing ? availability : schedule;
  return (
    <div
      className={`doctor-page ${editing ? 'doctor-availability-page' : 'doctor-schedule-page'}`}
      data-figma-node={editing ? '30:136' : dayView ? '42:1199' : '42:949'}
    >
      <PageHeader
        title={editing ? '진료 가능 시간' : '진료 일정'}
        description={
          editing
            ? '시간표를 클릭하거나 드래그해 매주 반복할 진료 가능 시간을 선택해 주세요.'
            : undefined
        }
        actions={
          !editing ? (
            <nav className="doctor-switch">
              <Link
                aria-current={dayView ? 'page' : undefined}
                to={`/doctor/schedule/day?date=${date}`}
              >
                일간
              </Link>
              <Link
                aria-current={!dayView ? 'page' : undefined}
                to={`/doctor/schedule?date=${date}`}
              >
                주간
              </Link>
            </nav>
          ) : (
            <Button
              type="submit"
              form="doctor-availability"
              disabled={
                write.pending || !availability.data || availability.isFetching
              }
            >
              변경사항 저장
            </Button>
          )
        }
      />
      {notice && <p role="status">{notice}</p>}
      {write.error && !editing && !leaving && <p role="alert">{write.error}</p>}
      {!editing && (
        <div className="doctor-navigation">
          <Button
            size="compact"
            onClick={() => setDate(shiftDate(date, dayView ? -1 : -7))}
            aria-label="이전 기간"
          >
            ‹
          </Button>
          <label className="doctor-date-picker">
            <span className="doctor-date-label">
              {dayView
                ? longDateLabel(date)
                : `${dateLabel(from)} – ${dateLabel(to).slice(5)}`}
            </span>
            <Input
              aria-label="선택 날짜"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <Button
            size="compact"
            aria-label="다음 기간"
            onClick={() => setDate(shiftDate(date, dayView ? 1 : 7))}
          >
            ›
          </Button>
          <Button
            variant="secondary"
            size="compact"
            onClick={() => setDate(businessDate())}
          >
            오늘
          </Button>
          {!dayView && (
            <span className="doctor-selected-date">
              선택한 날짜　{longDateLabel(date).replace(/^\d+년 /, '')}
            </span>
          )}
          <Button
            className="doctor-leave-button"
            variant="secondary"
            size="compact"
            onClick={() => setLeaving(true)}
          >
            휴진 신청
          </Button>
        </div>
      )}
      {!editing && !dayView && (
        <p className="doctor-schedule-hint">
          취소되지 않은 예약이 있으면 휴진 신청을 제한합니다.
        </p>
      )}
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : editing ? (
        <AvailabilityEditor
          key={`${user!.doctorId}`}
          initial={availability.data!}
          pending={write.pending}
          onSave={(slots) =>
            void write.run(
              () => service.save(slots),
              () => {
                void refresh();
                setNotice('진료 가능 시간을 저장했습니다.');
              },
            )
          }
        />
      ) : (
        schedule.data && (
          <>
            {leaves.isError && (
              <ErrorState
                message={leaves.error.message}
                onRetry={() => void leaves.refetch()}
              />
            )}
            <div className={dayView ? 'doctor-day' : 'doctor-week'}>
              <div className="doctor-grid-scroll">
                <table
                  ref={table}
                  className={`doctor-grid ${dayView ? 'doctor-grid--day' : ''}`}
                >
                  <caption>{dayView ? '오늘의 시간표' : '주간 시간표'}</caption>
                  <thead>
                    <tr>
                      <th>시각</th>
                      {(dayView
                        ? [date]
                        : days.map((_, i) => shiftDate(from, i))
                      ).map((d) => (
                        <th key={d}>
                          <button
                            type="button"
                            aria-pressed={d === date}
                            onClick={() => setDate(d)}
                          >
                            {names[weekday(d)]} {d.slice(8)}
                            {schedule.data!.leaves.some((l) => l.date === d) &&
                              ' · 휴진'}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 72 }, (_, i) => i * 20)
                      .filter(
                        (m) =>
                          (m >= 540 && m < 1080) ||
                          schedule.data!.availability.some(
                            (s) =>
                              minutes(s.startTime) <= m &&
                              minutes(s.endTime) > m,
                          ) ||
                          allItems.some((a) => {
                            const t = minutes(dateTimeLabel(a.time, true));
                            return t >= m && t < m + 20;
                          }),
                      )
                      .map((m) => (
                        <tr key={m}>
                          <th>{clock(m)}</th>
                          {(dayView
                            ? [date]
                            : days.map((_, i) => shiftDate(from, i))
                          ).map((d) => {
                            const off = schedule.data!.leaves.some(
                              (l) => l.date === d,
                            );
                            const items = allItems.filter(
                              (a) =>
                                a.time.slice(0, 10) === d &&
                                minutes(dateTimeLabel(a.time, true)) >= m &&
                                minutes(dateTimeLabel(a.time, true)) < m + 20,
                            );
                            return (
                              <td
                                key={d}
                                data-slot-start={dayView ? m : undefined}
                                data-picker-edge={
                                  !dayView && weekday(d) !== 0 && weekday(d) < 4
                                    ? 'right'
                                    : 'left'
                                }
                                data-picker-bottom={
                                  m >= 1000 ? 'true' : undefined
                                }
                                data-selected-day={
                                  d === date ? 'true' : undefined
                                }
                                className={
                                  off
                                    ? 'is-leave'
                                    : includesSlot(
                                          schedule.data!.availability,
                                          weekday(d),
                                          clock(m),
                                        )
                                      ? 'is-open'
                                      : 'is-closed'
                                }
                              >
                                {items.length > 1 && !dayView ? (
                                  <button
                                    id={`doctor-patient-trigger-${items[0].id}`}
                                    data-doctor-patient-trigger
                                    aria-haspopup="dialog"
                                    aria-expanded={
                                      patientOptions[0]?.id === items[0].id
                                    }
                                    className="doctor-patient doctor-patient-group"
                                    type="button"
                                    aria-label={`${names[weekday(d)]} ${clock(m)} 환자 ${items.length}명 선택`}
                                    onClick={() =>
                                      setPatientOptions((current) =>
                                        current[0]?.id === items[0].id
                                          ? []
                                          : items,
                                      )
                                    }
                                  >
                                    {items
                                      .map((a) => a.patient.name)
                                      .join(' · ')}
                                  </button>
                                ) : (
                                  items.map((a) => (
                                    <Link
                                      className="doctor-patient"
                                      key={a.id}
                                      to={patientPath(a)}
                                      state={{
                                        returnTo: `${location.pathname}${location.search}`,
                                      }}
                                    >
                                      <span>{a.patient.name}</span>
                                      {dayView && (
                                        <span>{statusLabels[a.status]}</span>
                                      )}
                                    </Link>
                                  ))
                                )}
                                {!dayView &&
                                  items.length > 1 &&
                                  patientOptions[0]?.id === items[0].id && (
                                    <SchedulePatientPicker
                                      items={patientOptions}
                                      time={clock(m)}
                                      triggerId={`doctor-patient-trigger-${items[0].id}`}
                                      returnTo={`${location.pathname}${location.search}`}
                                      to={patientPath}
                                      onClose={() => setPatientOptions([])}
                                    />
                                  )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
                {dayView && (
                  <CurrentTime key={date} date={date} table={table} />
                )}
              </div>
              {dayView && (
                <div className="doctor-lists">
                  {(['appointments', 'receptions'] as const).map((kind) => (
                    <section key={kind}>
                      <h2>
                        {kind === 'appointments'
                          ? '오늘 예약 환자'
                          : '오늘 내원 환자'}
                      </h2>
                      {!schedule.data![kind].length && (
                        <p>등록된 환자가 없습니다.</p>
                      )}
                      {schedule.data![kind].map((r) => (
                        <div className="doctor-list-row" key={r.id}>
                          <span>
                            {dateTimeLabel(
                              'startsAt' in r ? r.startsAt : r.receivedAt,
                              true,
                            )}
                          </span>
                          <span>{r.patient.name}</span>
                          <span>
                            {r.patient.birthDate
                              ? dateLabel(r.patient.birthDate)
                              : '—'}
                          </span>
                          <span>{statusLabels[r.displayStatus]}</span>
                          <Link
                            className="clinical-link"
                            to={patientPath(
                              allItems.find((item) =>
                                kind === 'appointments'
                                  ? item.appointmentId === r.id
                                  : item.receptionId === r.id,
                              )!,
                            )}
                            state={{
                              returnTo: `${location.pathname}${location.search}`,
                            }}
                          >
                            {r.displayStatus === 'IN_PROGRESS'
                              ? '진료하기 ›'
                              : '보기 ›'}
                          </Link>
                        </div>
                      ))}
                    </section>
                  ))}
                </div>
              )}
            </div>
            {!allItems.length && <p>조회 기간의 예약·접수 일정이 없습니다.</p>}
            <details className="doctor-leave-list">
              <summary>휴진 목록</summary>
              {schedule.data.leaves.map((l) => (
                <p key={l.id}>{l.date} · 휴진</p>
              ))}
              {!schedule.data.leaves.length && <p>등록된 휴진이 없습니다.</p>}
            </details>
          </>
        )
      )}
      {availabilityError && (
        <Modal
          open
          title="변경사항을 저장할 수 없습니다"
          onClose={() => setAvailabilityError(false)}
          footer={
            <Button onClick={() => setAvailabilityError(false)}>확인</Button>
          }
        >
          <p role="alert">{write.error}</p>
          <p>예약 날짜와 시간을 확인한 뒤 다시 선택해 주세요.</p>
        </Modal>
      )}
      {leaving && (
        <Modal
          open
          title="선택한 날짜를 휴진으로 등록할까요?"
          onClose={() => {
            if (!write.pending) setLeaving(false);
          }}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={write.pending}
                onClick={() => setLeaving(false)}
              >
                취소
              </Button>
              <Button
                disabled={
                  write.pending || !schedule.data || schedule.isFetching
                }
                onClick={() =>
                  void write.run(
                    () => service.leave(date),
                    () => {
                      setLeaving(false);
                      setNotice('휴진을 등록했습니다.');
                      void refresh();
                    },
                  )
                }
              >
                {write.pending ? '등록 중…' : '휴진 등록'}
              </Button>
            </>
          }
        >
          <p>{date}</p>
          <p>취소되지 않은 예약이 있으면 휴진 등록이 제한됩니다.</p>
          {schedule.data && (
            <p>
              선택 날짜 예약{' '}
              {
                schedule.data.appointments.filter(
                  (a) =>
                    a.startsAt.slice(0, 10) === date &&
                    a.status !== 'CANCELLED',
                ).length
              }
              건
            </p>
          )}
          {write.error && <p role="alert">{write.error}</p>}
        </Modal>
      )}
    </div>
  );
}
function AvailabilityEditor({
  initial,
  pending,
  onSave,
}: {
  initial: Availability;
  pending: boolean;
  onSave: (slots: Availability['weeklySlots']) => void;
}) {
  const [slots, setSlots] = useState(initial.weeklySlots);
  const [error, setError] = useState('');
  const [allHours, setAllHours] = useState(false);
  const drag = useRef<boolean | null>(null);
  useEffect(() => {
    const stop = () => {
      drag.current = null;
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, []);
  function choose(day: number, m: number, value: boolean) {
    setSlots((previous) => {
      const cells = previous
        .flatMap((s) =>
          Array.from(
            { length: (minutes(s.endTime) - minutes(s.startTime)) / 20 },
            (_, i) => ({
              dayOfWeek: s.dayOfWeek,
              startTime: clock(minutes(s.startTime) + i * 20),
              endTime: clock(minutes(s.startTime) + (i + 1) * 20),
            }),
          ),
        )
        .filter((s) => !(s.dayOfWeek === day && s.startTime === clock(m)));
      if (value)
        cells.push({
          dayOfWeek: day,
          startTime: clock(m),
          endTime: clock(m + 20),
        });
      return normalizedSlots(cells);
    });
  }
  return (
    <form
      id="doctor-availability"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        try {
          setError('');
          onSave(normalizedSlots(slots));
        } catch (failure) {
          setError((failure as Error).message);
        }
      }}
    >
      <div className="doctor-editor-actions">
        <div className="doctor-legend">
          <span className="doctor-legend-available">진료 가능</span>
          <span className="doctor-legend-unavailable">진료 불가</span>
        </div>
        <p>한 칸 20분 · 드래그 또는 클릭으로 선택 / 해제</p>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="doctor-grid-scroll doctor-editor">
        <table className="doctor-grid">
          <caption>주간 진료 가능 시간 편집</caption>
          <thead>
            <tr>
              <th>시각</th>
              {days.map((d) => (
                <th key={d}>{names[d]}요일</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 72 }, (_, i) => i * 20)
              .filter(
                (m) =>
                  allHours ||
                  (m >= 540 && m < 1080) ||
                  initial.weeklySlots.some(
                    (s) => minutes(s.startTime) <= m && minutes(s.endTime) > m,
                  ),
              )
              .map((m) => (
                <tr key={m}>
                  <th>{clock(m)}</th>
                  {days.map((d) => {
                    const selected = includesSlot(slots, d, clock(m));
                    return (
                      <td key={d}>
                        <button
                          type="button"
                          disabled={pending}
                          aria-label={`${names[d]}요일 ${clock(m)}`}
                          aria-pressed={selected}
                          onPointerDown={(e) => {
                            if (e.button === 0) {
                              drag.current = !selected;
                              choose(d, m, !selected);
                            }
                          }}
                          onPointerEnter={() => {
                            if (drag.current !== null && !pending)
                              choose(d, m, drag.current);
                          }}
                          onClick={(e) => {
                            if (e.detail === 0) choose(d, m, !selected);
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="doctor-editor-secondary">
        <button
          type="button"
          className="clinical-link"
          onClick={() => setAllHours((value) => !value)}
        >
          {allHours ? '기본 시간 보기' : '전체 시간 보기'}
        </button>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => setSlots(initial.weeklySlots)}
        >
          변경 취소
        </Button>
      </div>
    </form>
  );
}

function patientPath(item: ReturnType<typeof scheduleItems>[number]) {
  if (item.visitId) return `/doctor/visits/${encodeURIComponent(item.visitId)}`;
  const params = new URLSearchParams({
    date: item.time.slice(0, 10),
    patient: item.patient.id,
  });
  if (item.appointmentId) params.set('appointment', item.appointmentId);
  else if (item.receptionId) params.set('reception', item.receptionId);
  return `/doctor/patients?${params}`;
}
