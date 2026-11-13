import { ClinicalRecordPanel } from './RecordWorkspace';
import { ClinicalHistory } from './ClinicalHistory';
import { DoctorClose } from './DoctorClose';
import { DraftExit } from './DraftExit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { staffService } from '../staff/service';
import type { StaffService } from '../staff/staffService';
import { queryKeys } from '../../services/api/queryKeys';
import { useBookingWrite } from '../appointments/queries';
import {
  businessDate,
  dateTimeLabel,
  dateLabel,
  longDateLabel,
  statusLabels,
} from '../staff/format';
import { normalizeDate } from '../staff/validation';
import { PageHeader } from '../../components/layout';
import {
  Button,
  Input,
  Select,
  Table,
  Modal,
  FormField,
} from '../../components/ui';
import { ErrorState, Loading } from '../../components/common';
import type { DisplayStatus } from '../staff/types';
import type { ClinicalInput } from './clinicalService';
import type { NursingService } from '../nurse/recordsService';
import './doctor.css';
import './clinical.css';
export function ClinicalPage({
  service = staffService,
}: {
  service?: StaffService;
}) {
  const { user } = useAuth();
  const { visitId } = useParams();
  return (
    <ClinicalSession
      key={`${user!.id}:${user!.doctorId}:${visitId ?? 'patients'}`}
      source={service}
    />
  );
}
function ClinicalSession({ source }: { source: StaffService }) {
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
  const nursing = useMemo(
    () => source.nursing(async () => principal.current),
    [source],
  );
  const { visitId } = useParams();
  const [params, setParams] = useSearchParams();
  const date = normalizeDate(params.get('date') ?? '') ?? businessDate();
  const [status, setStatus] = useState<DisplayStatus | undefined>();
  const location = useLocation();
  const [notice, setNotice] = useState(
    typeof location.state?.notice === 'string' ? location.state.notice : '',
  );
  const base = [
    ...queryKeys.resource(user!.id, 'doctor-clinical'),
    user!.doctorId,
  ];
  const patients = useQuery({
    queryKey: [...base, 'patients', date, status],
    queryFn: ({ signal }) => service.patients(date, status, signal),
    enabled: !visitId,
    gcTime: 0,
  });
  const visit = useQuery({
    queryKey: [...base, 'visit', visitId],
    queryFn: ({ signal }) => service.visit(visitId!, signal),
    enabled: !!visitId,
    gcTime: 0,
  });
  const requestedPatient = params.get('patient');
  const selectedPatient = patients.data?.find(
    (r) =>
      r.patient.id === requestedPatient &&
      (!params.get('appointment') ||
        r.appointmentId === params.get('appointment')) &&
      (!params.get('reception') || r.receptionId === params.get('reception')),
  );
  const patient = visit.data?.patient ?? selectedPatient?.patient;
  const history = useInfiniteQuery({
    queryKey: [...base, 'history', patient?.id],
    queryFn: ({ pageParam, signal }) =>
      service.history(patient!.id, { limit: 5, before: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextBefore ?? undefined) : undefined,
    enabled: !!patient,
    gcTime: 0,
  });
  const historyItems = history.data?.pages.flatMap((page) => page.data) ?? [];
  const requestedRecord = params.get('record');
  const recordIsKnown =
    !requestedRecord ||
    requestedRecord === visit.data?.clinicalRecordId ||
    historyItems.some((item) => item.clinicalRecordId === requestedRecord);
  const selectedRecord = requestedRecord
    ? recordIsKnown
      ? requestedRecord
      : null
    : visitId
      ? visit.data?.status === 'COMPLETED'
        ? visit.data.clinicalRecordId
        : null
      : [...historyItems].sort((a, b) =>
          b.completedAt.localeCompare(a.completedAt),
        )[0]?.clinicalRecordId;
  const record = useQuery({
    queryKey: [...base, 'record', selectedRecord],
    queryFn: ({ signal }) => service.record(selectedRecord!, signal),
    enabled: !!selectedRecord,
    gcTime: 0,
  });
  if (!visitId && !requestedPatient)
    return (
      <section className="doctor-page" data-figma-node="92:1854">
        <PageHeader
          title="환자 진료"
          description={`${longDateLabel(date)} · ${user!.department?.name ?? ''}`}
        />
        <details className="clinical-search">
          <summary>조회 조건</summary>
          <form
            className="doctor-navigation clinical-filters"
            onSubmit={(e) => e.preventDefault()}
          >
            <label>
              조회 날짜
              <Input
                type="date"
                value={date}
                onChange={(e) => {
                  if (e.target.value) setParams({ date: e.target.value });
                }}
              />
            </label>
            <label>
              진행 상태
              <Select
                value={status ?? ''}
                onChange={(e) =>
                  setStatus((e.target.value as DisplayStatus) || undefined)
                }
              >
                <option value="">전체 상태</option>
                {Object.entries(statusLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </label>
          </form>
        </details>
        <h2 className="clinical-patients-title">오늘의 환자</h2>
        {patients.isPending ? (
          <Loading />
        ) : patients.isError ? (
          <ErrorState
            message={patients.error.message}
            onRetry={() => void patients.refetch()}
          />
        ) : (
          <div className="clinical-table">
            <Table
              caption="담당 환자"
              rows={patients.data}
              rowKey={(r) => r.visitId ?? r.receptionId ?? r.appointmentId!}
              emptyMessage="조건에 맞는 환자가 없습니다."
              columns={[
                {
                  id: 'time',
                  header: '시간',
                  render: (r) => dateTimeLabel(r.displayTime, true),
                },
                {
                  id: 'patient',
                  header: '환자',
                  render: (r) => r.patient.name,
                },
                {
                  id: 'birth',
                  header: '생년월일',
                  render: (r) =>
                    r.patient.birthDate ? dateLabel(r.patient.birthDate) : '—',
                },
                {
                  id: 'phone',
                  header: '연락처',
                  render: (r) => r.patient.phone || '—',
                },
                {
                  id: 'kind',
                  header: '구분',
                  render: (r) => (r.appointmentId ? '예약' : '현장 접수'),
                },
                {
                  id: 'status',
                  header: '상태',
                  render: (r) => statusLabels[r.displayStatus],
                },
                {
                  id: 'action',
                  header: <span className="sr-only">기록 보기</span>,
                  render: (r) => (
                    <Link
                      className="clinical-link"
                      to={
                        r.visitId
                          ? `/doctor/visits/${encodeURIComponent(r.visitId)}`
                          : `/doctor/patients?${new URLSearchParams({ date, patient: r.patient.id, ...(r.appointmentId ? { appointment: r.appointmentId } : { reception: r.receptionId! }) })}`
                      }
                      state={{ returnTo: `/doctor/patients?date=${date}` }}
                    >
                      기록 보기 ›
                    </Link>
                  ),
                },
              ]}
            />
          </div>
        )}
      </section>
    );
  const returnTo =
    typeof location.state?.returnTo === 'string' &&
    location.state.returnTo.startsWith('/doctor/')
      ? location.state.returnTo
      : `/doctor/patients?date=${date}`;
  const historyPath = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('record', id);
    return `${location.pathname}?${next}`;
  };
  const selectedHistory = history.data?.pages
    .flatMap((p) => p.data)
    .find((h) => h.clinicalRecordId === selectedRecord);
  return (
    <section className="doctor-page" data-figma-node="30:84">
      <PageHeader
        title="환자 진료"
        description={
          patient
            ? `${patient.name} · ${patient.birthDate ? dateLabel(patient.birthDate) : '—'} · ${visit.data?.department.name ?? user!.department?.name ?? ''} · ${visit.data ? dateLabel(visit.data.startedAt.slice(0, 10)) : dateLabel(date)}`
            : undefined
        }
        actions={
          <>
            {visit.data?.status === 'IN_PROGRESS' && !selectedRecord && (
              <Button type="submit" form="clinical-form">
                진료 완료
              </Button>
            )}
            <DoctorClose to={returnTo} label="진료 화면 닫기" />
          </>
        }
      />
      {notice && <p role="status">{notice}</p>}
      {(visitId ? visit.isPending : patients.isPending) ? (
        <Loading />
      ) : visit.isError || patients.isError ? (
        <ErrorState
          message={(visit.error ?? patients.error)!.message}
          onRetry={() => void (visitId ? visit.refetch() : patients.refetch())}
        />
      ) : !patient ? (
        <p role="alert">
          선택한 환자를 조회할 수 없습니다. 목록에서 다시 선택해 주세요.
        </p>
      ) : (
        <div className="clinical-columns">
          <ClinicalHistory
            service={service}
            patientId={patient.id}
            base={base}
            selected={selectedRecord}
            path={historyPath}
            current={
              visit.data?.status === 'IN_PROGRESS'
                ? {
                    to: `${location.pathname}?${new URLSearchParams([...params].filter(([key]) => key !== 'record'))}`,
                    label: `${dateLabel(visit.data.startedAt.slice(0, 10))} · ${visit.data.doctor.name}`,
                  }
                : undefined
            }
          />
          <div
            className="clinical-panel"
            role="region"
            aria-label="진료 기록 본문"
          >
            <h2>
              {selectedRecord
                ? `${selectedHistory ? dateLabel(selectedHistory.completedAt.slice(0, 10)) : '완료된'} 진료 기록`
                : '오늘 진료 기록'}
            </h2>
            {visit.data?.status === 'IN_PROGRESS' && !selectedRecord ? (
              <ClinicalForm
                complete={(input) => service.complete(visitId!, input)}
                onSaved={() =>
                  setNotice('진료 기록을 저장하고 진료를 완료했습니다.')
                }
              />
            ) : record.isError ? (
              <ErrorState
                message={record.error.message}
                onRetry={() => void record.refetch()}
              />
            ) : record.data ? (
              <ClinicalRecordPanel
                key={record.data.id}
                service={service}
                record={record.data}
                base={base}
              />
            ) : selectedRecord ? (
              <Loading />
            ) : (
              <p>
                {visitId
                  ? '완료된 과거 Mock 진료이며 기록 원본 데이터가 없습니다. 다시 완료할 수 없습니다.'
                  : '완료된 진료 이력이 없습니다. 입실 확인 전에는 진료 기록을 작성할 수 없습니다.'}
              </p>
            )}
            {recordIsKnown &&
              (selectedHistory?.receptionId || visit.data?.receptionId) && (
                <NursingRead
                  service={nursing}
                  receptionId={
                    selectedHistory?.receptionId ?? visit.data!.receptionId
                  }
                  base={base}
                />
              )}
          </div>
        </div>
      )}
    </section>
  );
}
function ClinicalForm({
  complete,
  onSaved,
}: {
  complete: (input: ClinicalInput) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<ClinicalInput>({
    symptoms: '',
    diagnosis: '',
    opinion: '',
  });
  const [confirm, setConfirm] = useState(false);
  const write = useBookingWrite();
  return (
    <>
      <DraftExit
        dirty={Object.values(draft).some((v) => !!v.trim())}
        busy={write.pending}
      />
      <form
        id="clinical-form"
        aria-busy={write.pending}
        onSubmit={(e) => {
          e.preventDefault();
          if (!write.pending) setConfirm(true);
        }}
      >
        {(['symptoms', 'diagnosis', 'opinion'] as const).map((k, i) => (
          <FormField
            key={k}
            id={`clinical-${k}`}
            label={['증상', '진단', '소견'][i]}
          >
            <textarea
              className="clinical-input"
              value={draft[k]}
              disabled={write.pending}
              onChange={(e) => setDraft((p) => ({ ...p, [k]: e.target.value }))}
            />
          </FormField>
        ))}
        {write.error && !confirm && <p role="alert">{write.error}</p>}
      </form>
      {confirm && (
        <Modal
          open
          title="진료 기록을 저장하고 완료할까요?"
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
                    () => complete(draft),
                    () => {
                      setConfirm(false);
                      onSaved();
                    },
                  )
                }
              >
                {write.pending ? '완료 중…' : '완료 확정'}
              </Button>
            </>
          }
        >
          <p>
            저장과 진료 완료가 함께 처리됩니다. 완료 후에는 읽기 전용으로
            표시됩니다.
          </p>
          {Object.values(draft).some((v) => !v.trim()) && (
            <p>
              입력하지 않은 항목이 있습니다. 현재 명세에는 빈 문자열 제한이
              없습니다.
            </p>
          )}
          {write.error && <p role="alert">{write.error}</p>}
        </Modal>
      )}
    </>
  );
}
function NursingRead({
  service,
  receptionId,
  base,
}: {
  service: NursingService;
  receptionId: string;
  base: (string | null | undefined)[];
}) {
  const notes = useInfiniteQuery({
    queryKey: [...base, 'nursing', receptionId],
    queryFn: ({ pageParam, signal }) =>
      service.list(receptionId, { limit: 5, before: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) =>
      p.meta.hasMore ? (p.meta.nextBefore ?? undefined) : undefined,
    gcTime: 0,
  });
  const [id, setId] = useState('');
  const selected = id || notes.data?.pages[0].data[0]?.id;
  return (
    <section className="clinical-nursing">
      <h2>간호 기록</h2>
      {notes.isPending ? (
        <Loading />
      ) : notes.isError ? (
        <ErrorState
          message={notes.error.message}
          onRetry={() => void notes.refetch()}
        />
      ) : (
        <>
          {!notes.data.pages.some((p) => p.data.length) && (
            <p>등록된 간호 기록이 없습니다.</p>
          )}
          {[...notes.data.pages]
            .reverse()
            .flatMap((p) => p.data)
            .map((r) => (
              <Button
                key={r.id}
                variant="secondary"
                size="compact"
                onClick={() => setId(r.id)}
              >
                {dateTimeLabel(r.createdAt)} · {r.author.name}
              </Button>
            ))}
          {notes.hasNextPage && (
            <Button
              variant="secondary"
              disabled={notes.isFetchingNextPage}
              onClick={() => void notes.fetchNextPage()}
            >
              이전 간호 기록 더 보기
            </Button>
          )}
          {selected && (
            <NursingDetail
              key={selected}
              service={service}
              id={selected}
              base={base}
            />
          )}
        </>
      )}
    </section>
  );
}
function NursingDetail({
  service,
  id,
  base,
}: {
  service: NursingService;
  id: string;
  base: (string | null | undefined)[];
}) {
  const [n, setN] = useState<number | null>(null);
  const detail = useQuery({
    queryKey: [...base, 'nursing-detail', id],
    queryFn: ({ signal }) => service.detail(id, signal),
    gcTime: 0,
  });
  const version = useQuery({
    queryKey: [...base, 'nursing-version', id, n],
    queryFn: ({ signal }) => service.version(id, n!, signal),
    enabled: n !== null,
    gcTime: 0,
  });
  const v = n === null ? detail.data?.latestVersion : version.data;
  return (
    <>
      {detail.isPending ? (
        <Loading />
      ) : detail.isError ? (
        <ErrorState
          message={detail.error.message}
          onRetry={() => void detail.refetch()}
        />
      ) : (
        <>
          <nav aria-label="간호 기록 버전">
            {detail.data.versions.map((s) => (
              <button
                className="clinical-link"
                type="button"
                key={s.id}
                aria-pressed={
                  (n ?? detail.data.latestVersion.versionNo) === s.versionNo
                }
                onClick={() => setN(s.versionNo)}
              >
                {s.versionNo === 1 ? '원본' : `${s.versionNo - 1}차 정정`}
              </button>
            ))}
          </nav>
          {version.isError ? (
            <ErrorState
              message={version.error.message}
              onRetry={() => void version.refetch()}
            />
          ) : v ? (
            <>
              <p>
                {dateTimeLabel(v.createdAt)} · {v.author.name}
              </p>
              <p className="clinical-text">{v.content}</p>
              {v.correctionReason && (
                <p className="clinical-text">정정 사유: {v.correctionReason}</p>
              )}
            </>
          ) : (
            <Loading />
          )}
        </>
      )}
    </>
  );
}
