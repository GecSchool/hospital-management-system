import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import type { StaffService } from '../staff/staffService';
import { staffService } from '../staff/service';
import { useAuth } from '../auth/useAuth';
import { queryKeys } from '../../services/api/queryKeys';
import { PageHeader } from '../../components/layout';
import { Button, Input, FormField, Modal } from '../../components/ui';
import { Loading, ErrorState } from '../../components/common';
import type {
  ClinicalService,
  ClinicalRecord,
  ClinicalInput,
} from './clinicalService';
import { useClinicalWrite } from './clinicalWrite';
import { ClinicalHistory } from './ClinicalHistory';
import { DoctorClose } from './DoctorClose';
import { DraftExit } from './DraftExit';
import { ClinicalRead } from './ClinicalRead';
import { dateLabel, dateTimeLabel } from '../staff/format';
import './clinical.css';
import './doctor.css';
export function ClinicalRecordPanel({
  service,
  record,
  base,
}: {
  service: ClinicalService;
  record: ClinicalRecord;
  base: (string | null | undefined)[];
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const query = useQuery({
    queryKey: [...base, 'clinical-version', record.id, selected],
    queryFn: ({ signal }) => service.version(record.id, selected!, signal),
    enabled: selected !== null,
    gcTime: 0,
  });
  const version = selected === null ? record.latestVersion : query.data;
  return (
    <>
      <nav className="clinical-versions" aria-label="진료 기록 버전">
        {record.versions.map((v) => (
          <button
            className="clinical-link"
            type="button"
            key={v.id}
            aria-pressed={
              (selected ?? record.latestVersion.versionNo) === v.versionNo
            }
            onClick={() => setSelected(v.versionNo)}
          >
            {v.versionNo === 1 ? '원본' : `${v.versionNo - 1}차 정정`} ·{' '}
            {dateTimeLabel(v.createdAt, true)}
            {v.versionNo === record.latestVersion.versionNo ? ' (최신)' : ''}
          </button>
        ))}
      </nav>
      {query.isError ? (
        <ErrorState
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : version ? (
        <ClinicalRead version={version} />
      ) : (
        <Loading />
      )}
      <div className="clinical-record-actions">
        <Link
          className="clinical-link"
          to={`/doctor/records/${encodeURIComponent(record.id)}/correct`}
        >
          정정 기록 추가 ›
        </Link>
        <Link
          className="clinical-link"
          to={`/doctor/visits/${encodeURIComponent(record.visitId)}/follow-up`}
        >
          재진 예약 ›
        </Link>
      </div>
    </>
  );
}
export function RecordCorrectionPage({
  service = staffService,
}: {
  service?: StaffService;
}) {
  const { user } = useAuth();
  const { recordId } = useParams();
  return (
    <CorrectionSession
      key={`${user!.id}:${user!.doctorId}:${recordId}`}
      source={service}
    />
  );
}
function CorrectionSession({ source }: { source: StaffService }) {
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
  const { recordId } = useParams();
  const base = [
    ...queryKeys.resource(user!.id, 'doctor-clinical'),
    user!.doctorId,
  ];
  const record = useQuery({
    queryKey: [...base, 'record', recordId],
    queryFn: ({ signal }) => service.record(recordId!, signal),
    gcTime: 0,
  });
  const visit = useQuery({
    queryKey: [...base, 'visit', record.data?.visitId],
    queryFn: ({ signal }) => service.visit(record.data!.visitId, signal),
    enabled: !!record.data,
    gcTime: 0,
  });
  return (
    <section className="doctor-page" data-figma-node="130:3477">
      <PageHeader
        title="환자 진료"
        actions={
          <DoctorClose
            to={
              record.data
                ? `/doctor/visits/${encodeURIComponent(record.data.visitId)}`
                : '/doctor/patients'
            }
            label="정정 화면 닫기"
          />
        }
        description={
          visit.data
            ? `${visit.data.patient.name} · ${dateLabel(visit.data.patient.birthDate)} · ${visit.data.department.name} · ${visit.data.completedAt ? dateLabel(visit.data.completedAt.slice(0, 10)) : ''}`
            : undefined
        }
      />
      {record.isError || visit.isError ? (
        <ErrorState
          message={(record.error ?? visit.error)!.message}
          onRetry={() => {
            void record.refetch();
            if (record.data) void visit.refetch();
          }}
        />
      ) : !record.data || !visit.data ? (
        <Loading />
      ) : visit.data.status !== 'COMPLETED' ? (
        <p role="alert">완료된 진료만 정정할 수 있습니다.</p>
      ) : (
        <div className="clinical-columns">
          <div>
            <ClinicalHistory
              service={service}
              patientId={visit.data.patient.id}
              base={base}
              selected={record.data.id}
              path={(id) =>
                `/doctor/visits/${encodeURIComponent(record.data!.visitId)}?record=${encodeURIComponent(id)}`
              }
            />
            <details className="clinical-latest-reference">
              <summary>현재 최신 기록</summary>
              <ClinicalRead version={record.data.latestVersion} />
            </details>
          </div>
          <div className="clinical-panel">
            <CorrectionForm
              key={record.data.id}
              record={record.data}
              recordDate={visit.data.completedAt ?? visit.data.startedAt}
              service={service}
              reload={async () => {
                const result = await record.refetch();
                if (result.error || !result.data) throw result.error;
                return result.data;
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
function CorrectionForm({
  record,
  recordDate,
  service,
  reload,
}: {
  record: ClinicalRecord;
  recordDate: string;
  service: ClinicalService;
  reload: () => Promise<ClinicalRecord>;
}) {
  const navigate = useNavigate();
  const [base, setBase] = useState(record.latestVersion.versionNo);
  const [draft, setDraft] = useState<ClinicalInput>({
    symptoms: record.latestVersion.symptoms,
    diagnosis: record.latestVersion.diagnosis,
    opinion: record.latestVersion.opinion,
  });
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const write = useClinicalWrite();
  useEffect(() => {
    if (write.conflict) setConfirm(false);
  }, [write.conflict]);
  return (
    <>
      <DraftExit
        dirty={
          !!reason.trim() ||
          (['symptoms', 'diagnosis', 'opinion'] as const).some(
            (key) => draft[key] !== record.latestVersion[key],
          )
        }
        busy={write.pending}
      />
      <h2>{dateLabel(recordDate.slice(0, 10))} 진료 기록</h2>
      <p className="clinical-version-note">확인한 최신 버전: {base}</p>
      <form
        className="clinical-correction-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setAttempted(true);
          if (reason.trim() && !write.conflict && !write.pending && !refreshing)
            setConfirm(true);
        }}
      >
        {(['symptoms', 'diagnosis', 'opinion'] as const).map((k, i) => (
          <FormField
            key={k}
            id={`correction-${k}`}
            label={['증상', '진단', '소견'][i]}
          >
            <textarea
              className="clinical-input"
              disabled={write.pending}
              value={draft[k]}
              onChange={(e) => setDraft((p) => ({ ...p, [k]: e.target.value }))}
            />
          </FormField>
        ))}
        <FormField
          id="clinical-correction-reason"
          label="정정 사유"
          error={
            attempted && !reason.trim()
              ? '정정 사유를 입력해 주세요.'
              : undefined
          }
        >
          <Input
            required
            disabled={write.pending}
            value={reason}
            placeholder="정정 사유를 입력해 주세요"
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
        {write.error && <p role="alert">{write.error}</p>}
        {write.conflict && (
          <Button
            type="button"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              setRefreshError('');
              try {
                const latest = await reload();
                setBase(latest.latestVersion.versionNo);
                write.clear();
              } catch {
                setRefreshError(
                  '최신 기록을 불러오지 못했습니다. 다시 시도해 주세요.',
                );
              } finally {
                setRefreshing(false);
              }
            }}
          >
            최신 기록 다시 조회
          </Button>
        )}
        {refreshError && <p role="alert">{refreshError}</p>}
        <footer className="clinical-record-actions">
          <Link
            className="ui-button ui-button--secondary"
            to={`/doctor/visits/${encodeURIComponent(record.visitId)}`}
          >
            취소
          </Link>
          <Button
            type="submit"
            disabled={write.pending || write.conflict || refreshing}
          >
            정정 저장
          </Button>
        </footer>
      </form>
      <div className="clinical-follow-up">
        <Link
          className="clinical-link"
          to={`/doctor/visits/${encodeURIComponent(record.visitId)}/follow-up`}
        >
          재진 예약 ›
        </Link>
      </div>
      {confirm && (
        <Modal
          open
          title="정정 기록을 추가할까요?"
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
                      service.correct(record.id, {
                        baseVersionNo: base,
                        ...draft,
                        correctionReason: reason,
                      }),
                    () =>
                      navigate(
                        `/doctor/visits/${encodeURIComponent(record.visitId)}`,
                        { state: { notice: '정정 기록을 저장했습니다.' } },
                      ),
                  )
                }
              >
                {write.pending ? '저장 중…' : '정정 확정'}
              </Button>
            </>
          }
        >
          <p>기존 버전은 보존하고 새로운 버전을 추가합니다.</p>
          {write.error && <p role="alert">{write.error}</p>}
          {write.conflict && (
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              초안으로 돌아가기
            </Button>
          )}
        </Modal>
      )}
    </>
  );
}
