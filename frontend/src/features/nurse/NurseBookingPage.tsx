import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { staffService } from '../staff/service';
import type { StaffService } from '../staff/staffService';
import { AppointmentForm } from '../appointments/AppointmentFormPage';
import { bookingError, bookingKey } from '../appointments/queries';
import {
  Button,
  Input,
  Select,
  Table,
  Pagination,
  Modal,
} from '../../components/ui';
import { Loading, ErrorState } from '../../components/common';
import { PageHeader } from '../../components/layout';
import { dateTimeLabel, statusLabels } from '../staff/format';
import type { AppointmentFilters } from '../appointments/service';
import type { PatientFilters } from '../staff/types';
import { staffKeys } from '../staff/queries';
import { nursePatient } from './bookingService';
import '../staff/staff.css';
import './nurse.css';
export function NurseBookingPage({
  service = staffService,
}: {
  service?: StaffService;
}) {
  const { user } = useAuth();
  const location = useLocation();
  return (
    <Session
      key={`${user!.id}:${user!.department?.id}:${location.pathname}`}
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
    () => source.nurseBooking(async () => principal.current),
    [source],
  );
  const { patientId, appointmentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scope = useId();
  const choosing = location.pathname.endsWith('/new');
  const forming = !!patientId;
  const [draft, setDraft] = useState<PatientFilters & AppointmentFilters>({});
  const [criteria, setCriteria] = useState({ filters: draft, revision: 0 });
  const [page, setPage] = useState(1);
  const base = [...bookingKey(user!.id), user!.department?.id, 'nurse', scope];
  const query = useQuery<
    import('../staff/types').PageResult<
      | import('./bookingService').NursePatient
      | import('./bookingService').NurseAppointment
    >
  >({
    queryKey: [
      ...base,
      choosing ? 'patients' : 'list',
      criteria.revision,
      page,
    ],
    queryFn: ({ signal }) =>
      choosing
        ? service.list(criteria.filters, { page, size: 5 }, signal)
        : service.booking.list(criteria.filters, { page, size: 4 }, signal),
    enabled: !forming,
  });
  const detail = useQuery({
    queryKey: [...base, 'detail', appointmentId],
    queryFn: ({ signal }) => service.booking.detail(appointmentId!, signal),
    enabled: !!appointmentId,
  });
  const doctors = useQuery({
    queryKey: [...base, 'doctors'],
    queryFn: ({ signal }) =>
      service.booking.doctors(user!.department!.id, signal),
  });
  if (forming) return <AppointmentForm source={service} />;
  const set = (key: keyof typeof draft, value: string) =>
    setDraft((p) => ({ ...p, [key]: value || undefined }));
  return (
    <section
      className="staff-page"
      data-figma-node={choosing ? '100:272' : undefined}
    >
      <PageHeader
        title={choosing ? '예약 환자 선택' : '예약 현황'}
        description={
          choosing
            ? '예약할 환자를 검색하여 선택합니다.'
            : `소속 진료과: ${user!.department?.name}`
        }
        actions={
          <Link
            className="nurse-link"
            to={choosing ? '/nurse/appointments' : '/nurse/appointments/new'}
          >
            {choosing ? '예약 목록' : '예약 등록'}
          </Link>
        }
      />
      {location.state?.notice && (
        <p role="status">{String(location.state.notice)}</p>
      )}
      <form
        className="nurse-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setCriteria((p) => ({ filters: draft, revision: p.revision + 1 }));
          setPage(1);
        }}
      >
        <label>
          이름
          <Input
            value={(choosing ? draft.name : draft.patientName) ?? ''}
            onChange={(e) =>
              set(choosing ? 'name' : 'patientName', e.target.value)
            }
          />
        </label>
        {choosing ? (
          <>
            <label>
              생년월일
              <Input
                type="date"
                value={draft.birthDate ?? ''}
                onChange={(e) => set('birthDate', e.target.value)}
              />
            </label>
            <label>
              연락처
              <Input
                value={draft.phone ?? ''}
                onChange={(e) => set('phone', e.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            <label>
              날짜
              <Input
                type="date"
                value={draft.date ?? ''}
                onChange={(e) => set('date', e.target.value)}
              />
            </label>
            <label>
              담당 의사
              <Select
                value={draft.doctorId ?? ''}
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
          </>
        )}
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
      <h2>
        {choosing ? '전체 환자' : '전체 예약'} · 총{' '}
        {query.data?.meta.totalItems ?? 0}건
      </h2>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState
          message={bookingError(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <div className="staff-table">
            <Table
              caption={choosing ? '예약 환자 선택' : '예약 목록'}
              rows={query.data.data}
              rowKey={(r) => r.id}
              emptyMessage="검색 결과가 없습니다."
              columns={[
                {
                  id: 'name',
                  header: '이름',
                  render: (r) => ('patient' in r ? r.patient.name : r.name),
                },
                {
                  id: 'date',
                  header: choosing ? '생년월일' : '예약 일시',
                  render: (r) =>
                    'startsAt' in r ? dateTimeLabel(r.startsAt) : r.birthDate,
                },
                {
                  id: 'info',
                  header: choosing ? '연락처' : '담당 의사',
                  render: (r) => ('doctor' in r ? r.doctor.name : r.phone),
                },
                ...(!choosing
                  ? [
                      {
                        id: 'status',
                        header: '상태',
                        render: (r: (typeof query.data.data)[number]) =>
                          'displayStatus' in r
                            ? statusLabels[r.displayStatus]
                            : '',
                      },
                    ]
                  : []),
                {
                  id: 'action',
                  header: '선택',
                  render: (r) => (
                    <Link
                      className="nurse-link"
                      to={
                        choosing
                          ? `/nurse/appointments/new/${encodeURIComponent(r.id)}`
                          : `/nurse/appointments/${encodeURIComponent(r.id)}`
                      }
                      state={choosing ? { patientId: r.id } : undefined}
                      onClick={() => {
                        if (choosing && 'birthDate' in r) {
                          queryClient.setQueryData(
                            staffKeys.detail(user!.id, r.id),
                            nursePatient(r),
                          );
                        }
                      }}
                    >
                      {choosing ? '선택 ›' : '상세 보기 ›'}
                    </Link>
                  ),
                },
              ]}
            />
          </div>
          <Pagination
            page={page}
            totalPages={query.data.meta.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
      {appointmentId && (
        <Modal
          open
          title="예약 상세"
          onClose={() => navigate('/nurse/appointments')}
        >
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
                {detail.data.patient.name} · {detail.data.patient.birthDate}
              </p>
              <p>
                {detail.data.department.name} · {detail.data.doctor.name}
              </p>
              <p>
                {dateTimeLabel(detail.data.startsAt)} ·{' '}
                {statusLabels[detail.data.displayStatus]}
              </p>
              <p>등록 계정: {detail.data.registeredBy.name}</p>
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
