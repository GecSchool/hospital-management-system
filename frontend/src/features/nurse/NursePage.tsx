import { useId, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { staffService } from '../staff/service';
import type { StaffService } from '../staff/staffService';
import {
  businessDate,
  dateLabel,
  dateTimeLabel,
  statusLabels,
  shiftDate,
} from '../staff/format';
import { pageFromSearch } from '../staff/queries';
import { bookingError, useBookingWrite } from '../appointments/queries';
import { queryKeys } from '../../services/api/queryKeys';
import { PageHeader } from '../../components/layout';
import {
  Button,
  Input,
  Select,
  Modal,
  Pagination,
  Table,
} from '../../components/ui';
import { ErrorState, Loading } from '../../components/common';
import type { ReceptionFilters } from '../receptions/service';
import './nurse.css';
export function NursePage({
  service = staffService,
}: {
  service?: StaffService;
}) {
  const { user } = useAuth();
  return <NurseSession key={user!.id} source={service} />;
}
function NurseSession({ source }: { source: StaffService }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const principal = useRef(user);
  principal.current = user;
  const service = useMemo(
    () => source.nurse(async () => principal.current),
    [source],
  );
  const scope = useId();
  const [params, setParams] = useSearchParams();
  const page = pageFromSearch(params);
  const { receptionId } = useParams();
  const [date, setDate] = useState(businessDate());
  const [draft, setDraft] = useState({ name: '', birthDate: '', doctorId: '' });
  const [criteria, setCriteria] = useState({
    filters: {} as Partial<ReceptionFilters>,
    revision: 0,
  });
  const [status, setStatus] = useState('');
  const [notice, setNotice] = useState('');
  const write = useBookingWrite();
  const base = queryKeys.resource(user!.id, 'nurse-receptions');
  const doctors = useQuery({
    queryKey: [...base, 'doctors'],
    queryFn: ({ signal }) => service.doctors(signal),
  });
  const list = useQuery({
    queryKey: [...base, scope, criteria.revision, date, status, page],
    queryFn: ({ signal }) =>
      service.list(
        {
          ...criteria.filters,
          date,
          status: (status as ReceptionFilters['status']) || undefined,
        },
        { page, size: 5 },
        signal,
      ),
  });
  const detail = useQuery({
    queryKey: [...base, 'detail', receptionId],
    queryFn: ({ signal }) => service.detail(receptionId!, signal),
    enabled: !!receptionId,
  });
  function shift(days: number) {
    setDate(shiftDate(date, days));
    setParams({ page: '1' });
  }
  function mutate(id: string, kind: 'call' | 'enter') {
    setNotice('');
    void write.run(
      () => service[kind](id),
      () =>
        setNotice(
          kind === 'call'
            ? '환자를 호출했습니다. 같은 의사의 이전 호출은 해제되었습니다.'
            : '입실을 확인하고 진료를 시작했습니다.',
        ),
    );
  }
  const actions = (row: NonNullable<typeof detail.data>) => (
    <>
      {row.displayStatus === 'REGISTERED' ? (
        <Button
          size="compact"
          variant="secondary"
          disabled={write.pending}
          onClick={() => mutate(row.id, 'call')}
        >
          호출
        </Button>
      ) : row.displayStatus === 'CALLED' ? (
        <Button
          size="compact"
          variant="secondary"
          disabled={write.pending}
          onClick={() => mutate(row.id, 'enter')}
        >
          입실 확인
        </Button>
      ) : null}
      <Link
        className="nurse-link"
        to={`/nurse/receptions/${encodeURIComponent(row.id)}/records`}
      >
        간호 기록 ›
      </Link>
    </>
  );
  return (
    <section className="nurse-page" data-figma-node="31:4">
      <PageHeader
        title="접수 환자 현황"
        description={`소속 진료과: ${user!.department?.name ?? '미확인'}`}
        actions={
          <div className="nurse-date">
            <button
              type="button"
              aria-label="이전 날짜"
              onClick={() => shift(-1)}
            >
              ‹
            </button>
            <label>
              <span className="sr-only">조회 날짜</span>
              <Input
                type="date"
                value={date}
                onChange={(e) => {
                  if (e.target.value) {
                    setDate(e.target.value);
                    setParams({ page: '1' });
                  }
                }}
              />
            </label>
            <button
              type="button"
              aria-label="다음 날짜"
              onClick={() => shift(1)}
            >
              ›
            </button>
            <Button
              size="compact"
              variant="secondary"
              onClick={() => {
                setDate(businessDate());
                setParams({ page: '1' });
              }}
            >
              오늘
            </Button>
          </div>
        }
      />
      <form
        className="nurse-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setCriteria((p) => ({
            filters: {
              name: draft.name.trim() || undefined,
              birthDate: draft.birthDate || undefined,
              doctorId: draft.doctorId || undefined,
            },
            revision: p.revision + 1,
          }));
          setParams({ page: '1' });
        }}
      >
        <label>
          이름
          <Input
            value={draft.name}
            onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
          />
        </label>
        <label>
          생년월일
          <Input
            type="date"
            value={draft.birthDate}
            onChange={(e) =>
              setDraft((p) => ({ ...p, birthDate: e.target.value }))
            }
          />
        </label>
        <label>
          담당 의사
          <Select
            value={draft.doctorId}
            onChange={(e) =>
              setDraft((p) => ({ ...p, doctorId: e.target.value }))
            }
          >
            <option value="">전체 의사</option>
            {doctors.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" size="compact">
          검색
        </Button>
      </form>
      {doctors.isError && (
        <ErrorState
          message={bookingError(doctors.error)}
          onRetry={() => void doctors.refetch()}
        />
      )}
      <h2>접수 환자</h2>
      <div className="nurse-tabs" role="group" aria-label="진행 상태">
        {[
          ['', '전체'],
          ['REGISTERED', '접수 완료'],
          ['CALLED', '호출됨'],
          ['IN_PROGRESS', '진료 중'],
          ['COMPLETED', '진료 완료'],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={status === id}
            onClick={() => {
              setStatus(id);
              setParams({ page: '1' });
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {notice && !receptionId && <p role="status">{notice}</p>}
      {write.error && !receptionId && <p role="alert">{write.error}</p>}
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState
          message={bookingError(list.error)}
          onRetry={() => void list.refetch()}
        />
      ) : (
        <>
          <div className="nurse-table" aria-busy={list.isFetching}>
            <Table
              caption="접수 환자"
              rows={list.data.data}
              rowKey={(r) => r.id}
              emptyMessage="조건에 맞는 접수 환자가 없습니다."
              columns={[
                {
                  id: 'time',
                  header: '접수 시각',
                  render: (r) => dateTimeLabel(r.receivedAt, true),
                },
                {
                  id: 'name',
                  header: '환자',
                  render: (r) => (
                    <Link
                      className="nurse-name"
                      to={`/nurse/receptions/${encodeURIComponent(r.id)}`}
                    >
                      {r.patient.name}
                    </Link>
                  ),
                },
                {
                  id: 'birth',
                  header: '생년월일',
                  render: (r) => dateLabel(r.patient.birthDate),
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
                  id: 'action',
                  header: <span className="sr-only">업무</span>,
                  render: actions,
                },
              ]}
            />
          </div>
          <Pagination
            page={page}
            totalPages={list.data.meta.totalPages}
            onPageChange={(p) => setParams({ page: String(p) })}
          />
          {page > 1 && !list.data.data.length && (
            <Button onClick={() => setParams({ page: '1' })}>
              첫 페이지로 이동
            </Button>
          )}
        </>
      )}
      {receptionId && (
        <Modal
          open
          title="접수 상세"
          onClose={() => {
            navigate('/nurse/patients');
          }}
          footer={
            <Link className="nurse-link" to="/nurse/patients">
              목록으로
            </Link>
          }
        >
          {write.error && <p role="alert">{write.error}</p>}
          {notice && <p role="status">{notice}</p>}
          {detail.isPending ? (
            <Loading />
          ) : detail.isError ? (
            <ErrorState
              message={bookingError(detail.error)}
              onRetry={() => void detail.refetch()}
            />
          ) : (
            <>
              <p>
                {detail.data.patient.name} ·{' '}
                {dateLabel(detail.data.patient.birthDate)}
              </p>
              <p>
                {detail.data.department.name} · {detail.data.doctor.name}
              </p>
              <p>
                {dateTimeLabel(detail.data.receivedAt)} ·{' '}
                {statusLabels[detail.data.displayStatus]}
              </p>
              {actions(detail.data)}
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
