import { AppointmentCheckIn } from '../receptions/ReceptionDialogs';
import { receptionEligibility } from '../receptions/queries';
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';
import { PageHeader } from '../../components/layout';
import {
  Button,
  Input,
  Select,
  Table,
  Pagination,
  Modal,
} from '../../components/ui';
import { ErrorState, Loading } from '../../components/common';
import { useAuth } from '../auth/useAuth';
import { useStaff } from '../staff/useStaff';
import { dateTimeLabel, statusLabels } from '../staff/format';
import { pageFromSearch } from '../staff/queries';
import { MockStaffControls } from '../staff/MockStaffControls';
import { bookingError, bookingKey, useBookingWrite } from './queries';
import type { AppointmentFilters } from './service';
import './appointments.css';
export function AppointmentListPage() {
  const { service } = useStaff();
  const { user } = useAuth();
  const scope = useId();
  const location = useLocation();
  const navigate = useNavigate();
  const { appointmentId } = useParams();
  const [params, setParams] = useSearchParams();
  const page = pageFromSearch(params);
  const [draft, setDraft] = useState<AppointmentFilters>({});
  const [criteria, setCriteria] = useState({
    filters: {} as AppointmentFilters,
    revision: 0,
  });
  const [notice, setNotice] = useState(
    typeof location.state?.notice === 'string' ? location.state.notice : '',
  );
  const departments = useQuery({
    queryKey: [...bookingKey(user!.id), 'departments'],
    queryFn: ({ signal }) => service.booking.departments(signal),
  });
  const doctors = useQuery({
    queryKey: [...bookingKey(user!.id), 'doctors', draft.departmentId],
    queryFn: ({ signal }) =>
      service.booking.doctors(draft.departmentId!, signal),
    enabled: !!draft.departmentId,
  });
  const query = useQuery({
    queryKey: [...bookingKey(user!.id), 'list', scope, criteria.revision, page],
    queryFn: ({ signal }) =>
      service.booking.list(criteria.filters, { page, size: 4 }, signal),
  });
  const set = (key: keyof AppointmentFilters, value: string) =>
    setDraft((p) => ({
      ...p,
      [key]: value || undefined,
      ...(key === 'departmentId' ? { doctorId: undefined } : {}),
    }));
  return (
    <section className="staff-page appointment-list" data-figma-node="26:515">
      <PageHeader
        title="예약·접수 현황"
        description="날짜별 예약과 접수 현황을 확인합니다."
      />
      <nav className="appointment-nav" aria-label="예약 및 접수">
        <Link to="/staff/receptions">접수 현황</Link>
        <Link to="/staff/appointments" aria-current="page">
          예약 현황
        </Link>
      </nav>
      {notice && (
        <p role="status" className="staff-notice">
          {notice}
        </p>
      )}
      <form
        className="appointment-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setCriteria((p) => ({
            filters: {
              ...draft,
              patientName: draft.patientName?.trim() || undefined,
            },
            revision: p.revision + 1,
          }));
          setParams({ page: '1' });
        }}
      >
        <label>
          환자
          <Input
            placeholder="환자 검색"
            value={draft.patientName ?? ''}
            onChange={(e) => set('patientName', e.target.value)}
          />
        </label>
        <label>
          날짜
          <Input
            type="date"
            value={draft.date ?? ''}
            onChange={(e) => set('date', e.target.value)}
          />
        </label>
        <label>
          진료과
          <Select
            value={draft.departmentId ?? ''}
            onChange={(e) => set('departmentId', e.target.value)}
          >
            <option value="">전체 진료과</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </label>
        <label>
          의사
          <Select
            value={draft.doctorId ?? ''}
            disabled={!draft.departmentId}
            onChange={(e) => set('doctorId', e.target.value)}
          >
            <option value="">전체 의사</option>
            {doctors.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </label>
        <label>
          상태
          <Select
            value={draft.status ?? ''}
            onChange={(e) => set('status', e.target.value)}
          >
            <option value="">전체 상태</option>
            {Object.entries(statusLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" size="compact">
          검색
        </Button>
      </form>
      {(departments.isError || doctors.isError) && (
        <ErrorState
          message="진료과·의사 필터를 불러오지 못했습니다."
          onRetry={() => {
            void departments.refetch();
            if (draft.departmentId) void doctors.refetch();
          }}
        />
      )}
      <div className="staff-section-heading">
        <h2>전체 예약</h2>
        <span>총 {query.data?.meta.totalItems ?? 0}건</span>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState
          message={bookingError(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <div
            className="staff-table staff-table--appointments"
            aria-busy={query.isFetching}
          >
            <Table
              caption="전체 예약"
              rows={query.data.data}
              rowKey={(r) => r.id}
              emptyMessage="조건에 맞는 예약이 없습니다."
              columns={[
                {
                  id: 'time',
                  header: '예약 일시',
                  render: (r) => dateTimeLabel(r.startsAt),
                },
                {
                  id: 'patient',
                  header: '환자',
                  render: (r) => (
                    <Link
                      className="staff-name-link"
                      to={`/staff/patients/${encodeURIComponent(r.patient.id)}`}
                    >
                      {r.patient.name}
                    </Link>
                  ),
                },
                {
                  id: 'department',
                  header: '진료과',
                  render: (r) => r.department.name,
                },
                {
                  id: 'doctor',
                  header: '담당 의사',
                  render: (r) => r.doctor.name,
                },
                {
                  id: 'status',
                  header: '상태',
                  render: (r) => statusLabels[r.displayStatus],
                },
                {
                  id: 'detail',
                  header: <span className="sr-only">상세</span>,
                  render: (r) => (
                    <Link
                      className="staff-text-link"
                      to={`/staff/appointments/${encodeURIComponent(r.id)}?page=${page}`}
                      aria-label={`${r.patient.name} ${dateTimeLabel(r.startsAt)} 상세 보기`}
                    >
                      상세 보기 ›
                    </Link>
                  ),
                },
              ]}
            />
          </div>
          <Pagination
            page={page}
            totalPages={query.data.meta.totalPages}
            onPageChange={(p) => setParams({ page: String(p) })}
          />
          {page > 1 && !query.data.data.length && (
            <Button
              variant="secondary"
              onClick={() => setParams({ page: '1' })}
            >
              첫 페이지로 이동
            </Button>
          )}
        </>
      )}
      {appointmentId && (
        <AppointmentPanel
          key={appointmentId}
          id={appointmentId}
          onClose={() => navigate(`/staff/appointments?page=${page}`)}
          onCancelled={() => setNotice('예약이 취소되었습니다.')}
        />
      )}
      <MockStaffControls />
    </section>
  );
}
function AppointmentPanel({
  id,
  onClose,
  onCancelled,
}: {
  id: string;
  onClose(): void;
  onCancelled(): void;
}) {
  const { service } = useStaff();
  const { user } = useAuth();
  const navigate = useNavigate();
  const write = useBookingWrite();
  const [confirm, setConfirm] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const query = useQuery({
    queryKey: [...bookingKey(user!.id), 'detail', id],
    queryFn: ({ signal }) => service.booking.detail(id, signal),
  });
  const item = query.data;
  const blocked =
    !item ||
    item.status === 'CANCELLED' ||
    !!item.receptionId ||
    item.displayStatus !== 'BOOKED';
  if (checkingIn && item)
    return (
      <AppointmentCheckIn
        appointment={item}
        onClose={() => setCheckingIn(false)}
        onSaved={() => {
          setCheckingIn(false);
          navigate('/staff/receptions', {
            state: { notice: '예약 환자 접수가 완료되었습니다.' },
          });
        }}
      />
    );
  if (confirm && item)
    return (
      <Modal
        open
        title="예약을 취소할까요?"
        className="appointment-cancel"
        description={`${item.patient.name} · ${item.department.name} · ${dateTimeLabel(item.startsAt)}`}
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
              취소
            </Button>
            <Button
              disabled={write.pending}
              onClick={() =>
                void write.run(
                  () => service.booking.cancel(id),
                  () => {
                    setConfirm(false);
                    onCancelled();
                  },
                )
              }
            >
              {write.pending ? '취소 중…' : '예약 취소'}
            </Button>
          </>
        }
      >
        <p>취소 시 예약 상태가 변경됩니다.</p>
        {write.error && <p role="alert">{write.error}</p>}
      </Modal>
    );
  return (
    <Modal
      open
      className="appointment-panel"
      title="예약 상세"
      onClose={onClose}
      footer={
        item ? (
          <>
            <div className="appointment-panel-actions">
              <Button
                variant="secondary"
                disabled={blocked}
                onClick={() =>
                  navigate(
                    `/staff/appointments/${encodeURIComponent(id)}/reschedule`,
                  )
                }
              >
                예약 변경
              </Button>
              <Button
                variant="secondary"
                disabled={blocked}
                onClick={() => setConfirm(true)}
              >
                예약 취소
              </Button>
            </div>
            <Button
              disabled={!!receptionEligibility(item)}
              title={receptionEligibility(item) ?? undefined}
              onClick={() => setCheckingIn(true)}
            >
              예약 환자 접수
            </Button>
            {receptionEligibility(item) && (
              <p className="reception-eligibility">
                {receptionEligibility(item)}
              </p>
            )}
          </>
        ) : undefined
      }
    >
      <button
        className="appointment-panel-close"
        type="button"
        onClick={onClose}
        aria-label="예약 상세 닫기"
      >
        ×
      </button>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState
          message={bookingError(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <dl>
            {[
              [
                '환자',
                `${item!.patient.name} · ${item!.patient.patientNumber}`,
              ],
              ['진료과', item!.department.name],
              ['담당 의사', item!.doctor.name],
              ['예약 일시', dateTimeLabel(item!.startsAt)],
              ['상태', statusLabels[item!.displayStatus]],
              ['등록 계정', item!.registeredBy.name],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {blocked && (
            <p role="status">
              취소되었거나 접수된 예약은 변경·취소할 수 없습니다.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
