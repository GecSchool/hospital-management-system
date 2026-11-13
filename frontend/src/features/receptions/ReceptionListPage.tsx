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
import { MockStaffControls } from '../staff/MockStaffControls';
import {
  businessDate,
  dateTimeLabel,
  longDateLabel,
  statusLabels,
} from '../staff/format';
import { pageFromSearch } from '../staff/queries';
import {
  bookingKey,
  bookingError,
  useBookingWrite,
} from '../appointments/queries';
import type { ReceptionFilters } from './service';
import { receptionKey } from './queries';
import './receptions.css';
export function ReceptionListPage() {
  const { service } = useStaff();
  const { user } = useAuth();
  const scope = useId();
  const { receptionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const page = pageFromSearch(params);
  const [draft, setDraft] = useState<ReceptionFilters>({
    date: businessDate(),
  });
  const [criteria, setCriteria] = useState({
    filters: { date: businessDate() } as ReceptionFilters,
    revision: 0,
  });
  const [notice, setNotice] = useState(
    typeof location.state?.notice === 'string' ? location.state.notice : '',
  );
  const [deleteId, setDelete] = useState<string>();
  const [validation, setValidation] = useState('');
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
    queryKey: [
      ...receptionKey(user!.id),
      'list',
      scope,
      criteria.revision,
      page,
    ],
    queryFn: ({ signal }) =>
      service.intake.list(criteria.filters, { page, size: 5 }, signal),
  });
  const set = (key: keyof ReceptionFilters, value: string) =>
    setDraft((p) => ({
      ...p,
      [key]: value,
      ...(key === 'departmentId' ? { doctorId: undefined } : {}),
    }));
  return (
    <section className="staff-page reception-list" data-figma-node="26:591">
      <PageHeader
        title="예약·접수 현황"
        description="오늘의 예약과 접수 현황을 확인합니다."
        actions={
          <Link
            className="ui-button ui-button--primary ui-button--compact"
            to="/staff/patients"
          >
            환자 관리
          </Link>
        }
      />
      <nav className="reception-nav" aria-label="예약 및 접수">
        <Link to="/staff/receptions" aria-current="page">
          접수 현황
        </Link>
        <Link to="/staff/appointments">예약 현황</Link>
      </nav>
      {notice && (
        <p role="status" className="staff-notice">
          {notice}
        </p>
      )}
      <form
        className="reception-filters"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.date) {
            setValidation('조회 날짜를 선택해 주세요.');
            return;
          }
          setValidation('');
          setCriteria((p) => ({
            filters: { ...draft, name: draft.name?.trim() || undefined },
            revision: p.revision + 1,
          }));
          setParams({ page: '1' });
        }}
      >
        <label>
          조회 날짜
          <Input
            type="date"
            required
            value={draft.date}
            onChange={(e) => set('date', e.target.value)}
          />
        </label>
        <label>
          환자명
          <Input
            placeholder="환자명 검색"
            value={draft.name ?? ''}
            onChange={(e) => set('name', e.target.value)}
          />
        </label>
        <label>
          생년월일
          <Input
            type="date"
            value={draft.birthDate ?? ''}
            onChange={(e) => set('birthDate', e.target.value)}
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
          담당 의사
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
          진행 상태
          <Select
            value={draft.status ?? ''}
            onChange={(e) => set('status', e.target.value)}
          >
            <option value="">전체 상태</option>
            {(
              ['REGISTERED', 'CALLED', 'IN_PROGRESS', 'COMPLETED'] as const
            ).map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" size="compact">
          검색
        </Button>
      </form>
      {validation && <p role="alert">{validation}</p>}
      {(departments.isError || doctors.isError) && (
        <ErrorState
          message="진료과·의사 필터를 불러오지 못했습니다."
          onRetry={() => {
            void departments.refetch();
            if (draft.departmentId) void doctors.refetch();
          }}
        />
      )}
      <p className="reception-date">{longDateLabel(criteria.filters.date)}</p>
      <div className="staff-section-heading">
        <h2>접수 현황</h2>
        <span>총 {query.data?.meta.totalItems ?? 0}건</span>
      </div>
      {query.isPending ? (
        <Loading message="접수 현황을 불러오고 있습니다." />
      ) : query.isError ? (
        <ErrorState
          message={bookingError(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <div
            className="staff-table reception-table"
            aria-busy={query.isFetching}
          >
            <Table
              caption="접수 현황"
              rows={query.data.data}
              rowKey={(r) => r.id}
              emptyMessage="조건에 맞는 접수가 없습니다."
              columns={[
                {
                  id: 'time',
                  header: '접수 시각',
                  render: (r) => dateTimeLabel(r.receivedAt, true),
                },
                {
                  id: 'patient',
                  header: '환자',
                  render: (r) => (
                    <Link
                      className="staff-name-link"
                      to={`/staff/patients/${encodeURIComponent(r.patient.id)}`}
                      title={r.patient.patientNumber}
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
                  id: 'type',
                  header: '구분',
                  render: (r) => (r.appointmentId ? '예약' : '현장 접수'),
                },
                {
                  id: 'status',
                  header: '진행 상태',
                  render: (r) => (
                    <Link
                      className="staff-text-link"
                      to={`/staff/receptions/${encodeURIComponent(r.id)}?page=${page}`}
                      aria-label={`${r.patient.name} ${dateTimeLabel(r.receivedAt)} 접수 상세`}
                    >
                      {statusLabels[r.displayStatus]}
                    </Link>
                  ),
                },
                {
                  id: 'delete',
                  header: <span className="sr-only">삭제</span>,
                  render: (r) => (
                    <button
                      className="reception-text-button"
                      type="button"
                      disabled={!!r.visitStatus}
                      title={
                        r.visitStatus
                          ? '진료가 시작된 접수는 삭제할 수 없습니다.'
                          : undefined
                      }
                      aria-label={`${r.patient.name} ${dateTimeLabel(r.receivedAt)} 접수 삭제`}
                      onClick={() => setDelete(r.id)}
                    >
                      접수 삭제
                    </button>
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
      {(deleteId || receptionId) && (
        <ReceptionAction
          key={`${deleteId ?? receptionId}:${!!deleteId}`}
          id={(deleteId ?? receptionId)!}
          deleting={!!deleteId}
          onClose={() => {
            if (deleteId) setDelete(undefined);
            else navigate(`/staff/receptions?page=${page}`);
          }}
          onDelete={() => setDelete(receptionId)}
          onRemoved={() => {
            setDelete(undefined);
            setNotice('접수가 삭제되었습니다. 연결된 예약은 유지됩니다.');
            if (receptionId) navigate(`/staff/receptions?page=${page}`);
          }}
        />
      )}
      <MockStaffControls />
    </section>
  );
}
function ReceptionAction({
  id,
  deleting,
  onClose,
  onDelete,
  onRemoved,
}: {
  id: string;
  deleting: boolean;
  onClose(): void;
  onDelete(): void;
  onRemoved(): void;
}) {
  const { service } = useStaff();
  const { user } = useAuth();
  const write = useBookingWrite();
  const query = useQuery({
    queryKey: [...receptionKey(user!.id), 'detail', id],
    queryFn: ({ signal }) => service.intake.detail(id, signal),
  });
  const row = query.data;
  const restricted =
    write.error === '간호 기록이 작성된 접수는 삭제할 수 없습니다.' ||
    write.error === '진료가 시작된 접수는 삭제할 수 없습니다.';
  return (
    <Modal
      open
      className="reception-confirm"
      title={
        restricted
          ? '접수를 삭제할 수 없습니다.'
          : deleting
            ? '접수를 삭제할까요?'
            : '접수 상세'
      }
      description={
        row
          ? `${row.patient.name} · ${row.department.name} · ${row.doctor.name}`
          : undefined
      }
      onClose={() => {
        if (!write.pending) onClose();
      }}
      footer={
        restricted ? (
          <Button onClick={onClose}>확인</Button>
        ) : (
          <>
            <Button
              variant="secondary"
              disabled={write.pending}
              onClick={onClose}
            >
              {deleting ? '취소' : '닫기'}
            </Button>
            {row && (
              <Button
                disabled={
                  write.pending || !!row.visitStatus || query.isFetching
                }
                onClick={() =>
                  deleting
                    ? void write.run(() => service.intake.remove(id), onRemoved)
                    : onDelete()
                }
              >
                {write.pending ? '삭제 중…' : deleting ? '삭제' : '접수 삭제'}
              </Button>
            )}
          </>
        )
      }
    >
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState
          message={bookingError(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          {deleting ? (
            <>
              <p>
                {dateTimeLabel(row!.receivedAt, true)} ·{' '}
                {row!.appointmentId ? '예약' : '현장 접수'}
              </p>
              {row!.appointmentId && (
                <p>접수를 삭제해도 원래 예약은 유지됩니다.</p>
              )}
              {row!.status === 'CALLED' && (
                <p>호출된 접수를 삭제하면 해당 호출도 해제됩니다.</p>
              )}
            </>
          ) : (
            <dl className="reception-detail-values">
              {[
                ['환자번호', row!.patient.patientNumber],
                ['접수 시각', dateTimeLabel(row!.receivedAt)],
                ['구분', row!.appointmentId ? '예약' : '현장 접수'],
                ['진행 상태', statusLabels[row!.displayStatus]],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {row!.visitStatus && <p>진료가 시작된 접수는 삭제할 수 없습니다.</p>}
        </>
      )}
      {write.error && <p role="alert">{write.error}</p>}
    </Modal>
  );
}
