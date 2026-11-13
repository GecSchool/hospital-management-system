import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ErrorState, Loading } from '../../components/common';
import { Pagination, Table, type TableColumn } from '../../components/ui';
import { useAuth } from '../auth/useAuth';
import { dateTimeLabel, statusLabels } from './format';
import { staffKeys } from './queries';
import { staffErrorMessage } from './validation';
import { useStaff } from './useStaff';
import type {
  HistoryKind,
  PageResult,
  StaffAppointment,
  StaffReception,
  StaffVisitSummary,
} from './types';
type HistoryRow = StaffAppointment | StaffReception | StaffVisitSummary;
const labels = {
  appointments: '예약 이력',
  receptions: '접수 이력',
  visits: '진료 이력',
};
export function PatientHistory({
  id,
  kind,
  active,
  page,
  onPageChange,
}: {
  id: string;
  kind: HistoryKind;
  active: boolean;
  page: number;
  onPageChange(page: number): void;
}) {
  const { service } = useStaff();
  const { user } = useAuth();
  const query = useQuery<PageResult<HistoryRow>>({
    queryKey: [...staffKeys.patients(user!.id), 'history', id, kind, page],
    queryFn: ({ signal }) => service[kind](id, { page, size: 5 }, signal),
    enabled: active,
  });
  if (!active) return null;
  if (query.isPending)
    return <Loading message={`${labels[kind]}을 불러오고 있습니다.`} />;
  if (query.isError)
    return (
      <ErrorState
        message={staffErrorMessage(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  const columns: TableColumn<HistoryRow>[] = [
    {
      id: 'date',
      header: kind === 'appointments' ? '예약 일시' : '일시',
      render: (row) =>
        dateTimeLabel(
          'startsAt' in row
            ? row.startsAt
            : 'receivedAt' in row
              ? row.receivedAt
              : row.completedAt,
        ),
    },
    ...(kind === 'appointments'
      ? [
          {
            id: 'patient',
            header: '환자',
            render: (row: HistoryRow) =>
              'patient' in row ? row.patient.name : '',
          },
        ]
      : []),
    {
      id: 'department',
      header: '진료과',
      render: (row) => row.department.name,
    },
    { id: 'doctor', header: '담당 의사', render: (row) => row.doctor.name },
    {
      id: 'status',
      header: kind === 'appointments' ? '상태' : '진행 상태',
      render: (row) => statusLabels[row.displayStatus],
    },
    ...(kind === 'appointments'
      ? [
          {
            id: 'detail',
            header: <span className="sr-only">상세</span>,
            render: (row: HistoryRow) =>
              'startsAt' in row ? (
                <Link
                  className="staff-text-link"
                  to={`/staff/appointments/${encodeURIComponent(row.id)}`}
                >
                  상세 보기 ›
                </Link>
              ) : null,
          },
        ]
      : kind === 'visits'
        ? [
            {
              id: 'followup',
              header: <span className="sr-only">재진 예약</span>,
              render: (row: HistoryRow) =>
                'visitId' in row && row === query.data.data[0] ? (
                  <Link
                    className="ui-button ui-button--secondary ui-button--compact"
                    to="/staff/appointments/new"
                    state={{ patientId: id }}
                  >
                    재진 예약
                  </Link>
                ) : null,
            },
          ]
        : []),
  ];
  return (
    <section
      data-figma-node={
        kind === 'appointments'
          ? '26:348'
          : kind === 'receptions'
            ? '193:6563'
            : '193:6599'
      }
    >
      <p className="staff-history-count">
        {labels[kind]} {query.data.meta.totalItems}건
      </p>
      <div
        className={`staff-table staff-table--${kind === 'appointments' ? 'appointments' : 'history'}`}
      >
        <Table
          caption={labels[kind]}
          columns={columns}
          rows={query.data.data}
          rowKey={(row) => ('id' in row ? row.id : row.visitId)}
          emptyMessage={`${labels[kind]}이 없습니다.`}
        />
      </div>
      <Pagination
        page={page}
        totalPages={query.data.meta.totalPages}
        onPageChange={onPageChange}
      />
    </section>
  );
}
