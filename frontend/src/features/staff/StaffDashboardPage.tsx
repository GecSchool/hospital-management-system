import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { PageHeader } from '../../components/layout';
import { ErrorState, Loading } from '../../components/common';
import { Table, type TableColumn } from '../../components/ui';
import { useAuth } from '../auth/useAuth';
import { MockStaffControls } from './MockStaffControls';
import {
  businessDate,
  dateTimeLabel,
  longDateLabel,
  statusLabels,
} from './format';
import { staffKeys } from './queries';
import { staffErrorMessage } from './validation';
import { useStaff } from './useStaff';
import type { StaffAppointment, StaffReception } from './types';
export function StaffDashboardPage() {
  const { user } = useAuth();
  const { service } = useStaff();
  const date = businessDate();
  const query = useQuery({
    queryKey: [...staffKeys.dashboard(user!.id), date],
    queryFn: ({ signal }) => service.dashboard(date, signal),
  });
  const receptionColumns: TableColumn<StaffReception>[] = [
    {
      id: 'time',
      header: '접수 시각',
      render: (row) => dateTimeLabel(row.receivedAt, true),
    },
    {
      id: 'patient',
      header: '환자',
      render: (row) => (
        <Link
          className="staff-name-link"
          to={`/staff/patients/${encodeURIComponent(row.patient.id)}`}
        >
          {row.patient.name}
        </Link>
      ),
    },
    {
      id: 'department',
      header: '진료과',
      render: (row) => row.department.name,
    },
    { id: 'doctor', header: '담당 의사', render: (row) => row.doctor.name },
    {
      id: 'type',
      header: '구분',
      render: (row) => (row.appointmentId ? '예약' : '현장 접수'),
    },
    {
      id: 'status',
      header: '진행 상태',
      render: (row) => (
        <span className="staff-status">{statusLabels[row.displayStatus]}</span>
      ),
    },
  ];
  const appointmentColumns: TableColumn<StaffAppointment>[] = [
    {
      id: 'time',
      header: '예약 일시',
      render: (row) => dateTimeLabel(row.startsAt),
    },
    { id: 'patient', header: '환자', render: (row) => row.patient.name },
    {
      id: 'department',
      header: '진료과',
      render: (row) => row.department.name,
    },
    { id: 'doctor', header: '담당 의사', render: (row) => row.doctor.name },
    {
      id: 'status',
      header: '상태',
      render: (row) => statusLabels[row.displayStatus],
    },
    {
      id: 'detail',
      header: <span className="sr-only">상세</span>,
      render: (row) => (
        <Link
          className="staff-text-link"
          to={`/staff/appointments/${encodeURIComponent(row.id)}`}
        >
          상세 보기 ›
        </Link>
      ),
    },
  ];
  return (
    <section className="staff-page staff-dashboard" data-figma-node="17:4">
      <PageHeader
        title="대시보드"
        description={longDateLabel(query.data?.date ?? date)}
        actions={
          <>
            <Link
              className="ui-button ui-button--secondary ui-button--compact"
              to="/staff/patients"
            >
              예약 등록
            </Link>
            <Link
              className="ui-button ui-button--primary ui-button--compact"
              to="/staff/patients"
            >
              현장 접수
            </Link>
          </>
        }
      />
      {query.isPending ? (
        <Loading message="당일 현황을 불러오고 있습니다." />
      ) : query.isError ? (
        <ErrorState
          message={staffErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <section
            className="staff-dashboard-section"
            aria-labelledby="reception-preview-title"
          >
            <div className="staff-section-heading">
              <h2 id="reception-preview-title">당일 접수 현황</h2>
              <Link
                className="staff-text-link"
                to="/staff/receptions"
                aria-label="접수 현황 전체 보기"
              >
                전체 보기 ›
              </Link>
            </div>
            <div className="staff-table staff-table--receptions">
              <Table
                caption="당일 접수 현황"
                columns={receptionColumns}
                rows={query.data.receptionPreview}
                rowKey={(row) => row.id}
                emptyMessage="당일 접수 내역이 없습니다."
              />
            </div>
          </section>
          <section
            className="staff-dashboard-section"
            aria-labelledby="appointment-preview-title"
          >
            <div className="staff-section-heading">
              <h2 id="appointment-preview-title">오늘 예약 환자</h2>
              <Link
                className="staff-text-link"
                to="/staff/appointments"
                aria-label="예약 목록 전체 보기"
              >
                전체 보기 ›
              </Link>
            </div>
            <div className="staff-table staff-table--appointments">
              <Table
                caption="오늘 예약 환자"
                columns={appointmentColumns}
                rows={query.data.appointmentPreview}
                rowKey={(row) => row.id}
                emptyMessage="오늘 예약 내역이 없습니다."
              />
            </div>
          </section>
        </>
      )}
      <MockStaffControls />
    </section>
  );
}
