import { WalkInDialog } from '../receptions/ReceptionDialogs';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import { Button, Tabs } from '../../components/ui';
import { ErrorState, Loading } from '../../components/common';
import { PageHeader } from '../../components/layout';
import { useAuth } from '../auth/useAuth';
import { PatientForm } from './PatientForm';
import { PatientHistory } from './PatientHistory';
import { MockStaffControls } from './MockStaffControls';
import { dateLabel } from './format';
import { pageFromSearch, staffKeys } from './queries';
import { staffErrorMessage } from './validation';
import { useStaff } from './useStaff';
import type { HistoryKind } from './types';
export function PatientDetailPage() {
  const { patientId = '' } = useParams();
  return <PatientDetail key={patientId} id={patientId} />;
}
function PatientDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const { service } = useStaff();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const tab: HistoryKind =
    rawTab === 'receptions' || rawTab === 'visits' ? rawTab : 'appointments';
  const page = pageFromSearch(params);
  const [walkin, setWalkin] = useState(false);
  const [checkinNotice, setCheckinNotice] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const query = useQuery({
    queryKey: staffKeys.detail(user!.id, id),
    queryFn: ({ signal }) => service.detail(id, signal),
  });
  const returnPage: unknown = location.state?.listPage;
  const backTo =
    typeof returnPage === 'number' &&
    Number.isSafeInteger(returnPage) &&
    returnPage > 0
      ? `/staff/patients?page=${returnPage}`
      : '/staff/patients';
  const breadcrumb = (
    <nav className="staff-breadcrumb" aria-label="경로">
      <Link to={backTo}>환자 목록</Link>
      <span aria-hidden="true"> / </span>
      <span>환자 상세</span>
    </nav>
  );
  if (query.isPending)
    return (
      <section>
        {breadcrumb}
        <h1 className="sr-only">환자 상세</h1>
        <Loading message="환자 정보를 불러오고 있습니다." />
        <MockStaffControls />
      </section>
    );
  if (query.isError)
    return (
      <section>
        {breadcrumb}
        <h1>환자 상세</h1>
        <ErrorState
          message={staffErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
        <MockStaffControls />
      </section>
    );
  const patient = query.data;
  return (
    <section className="staff-page staff-detail" data-figma-node="26:348">
      {breadcrumb}
      <PageHeader
        title={patient.name}
        description={`환자번호  ${patient.patientNumber}`}
        actions={
          <>
            <Button
              size="compact"
              variant="secondary"
              onClick={() => {
                setSaved(false);
                setEditing(true);
              }}
            >
              정보 수정
            </Button>
            <Link
              className="ui-button ui-button--secondary ui-button--compact"
              to="/staff/appointments/new"
              state={{ patientId: patient.id }}
            >
              예약 등록
            </Link>
            <Button
              size="compact"
              onClick={() => {
                setCheckinNotice(false);
                setWalkin(true);
              }}
            >
              현장 접수
            </Button>
          </>
        }
      />
      {checkinNotice && (
        <p className="staff-notice" role="status">
          현장 접수가 완료되었습니다.
        </p>
      )}
      {walkin && (
        <WalkInDialog
          patient={patient}
          onClose={() => setWalkin(false)}
          onSaved={() => {
            setWalkin(false);
            setCheckinNotice(true);
          }}
        />
      )}
      {saved && (
        <p className="staff-notice" role="status">
          환자 정보가 수정되었습니다.
        </p>
      )}
      <section
        className="staff-patient-info"
        aria-labelledby="patient-info-title"
      >
        <h2 id="patient-info-title">기본 정보</h2>
        <dl>
          <div>
            <dt>이름</dt>
            <dd>{patient.name}</dd>
          </div>
          <div>
            <dt>생년월일</dt>
            <dd>{dateLabel(patient.birthDate)}</dd>
          </div>
          <div>
            <dt>주민등록번호</dt>
            <dd>{patient.maskedResidentNumber}</dd>
          </div>
          <div>
            <dt>연락처</dt>
            <dd>{patient.phone}</dd>
          </div>
        </dl>
      </section>
      <Tabs
        label="환자 이력"
        value={tab}
        onChange={(next) => setParams({ tab: next, page: '1' })}
        items={(['appointments', 'receptions', 'visits'] as const).map(
          (kind) => ({
            id: kind,
            label: {
              appointments: '예약 이력',
              receptions: '접수 이력',
              visits: '진료 이력',
            }[kind],
            content: (
              <PatientHistory
                id={id}
                kind={kind}
                active={kind === tab}
                page={kind === tab ? page : 1}
                onPageChange={(next) =>
                  setParams({ tab: kind, page: String(next) })
                }
              />
            ),
          }),
        )}
      />
      {editing && (
        <PatientForm
          patient={patient}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setSaved(true);
          }}
        />
      )}
      <MockStaffControls />
    </section>
  );
}
