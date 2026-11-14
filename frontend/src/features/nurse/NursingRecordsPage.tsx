import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';
import { useAuth } from '../auth/useAuth';
import { staffService } from '../staff/service';
import type { StaffService } from '../staff/staffService';
import type {
  NursingRecordDetail,
  NursingRecordVersion,
} from './recordsService';
import { dateLabel, dateTimeLabel, statusLabels } from '../staff/format';
import { PageHeader } from '../../components/layout';
import { Button, FormField, Input } from '../../components/ui';
import { ErrorState, Loading } from '../../components/common';
import { recordError, recordKey, useRecordWrite } from './recordQueries';
import { queryKeys } from '../../services/api/queryKeys';
import './nurse.css';
import './records.css';

export function NursingRecordsPage({
  service = staffService,
}: {
  service?: StaffService;
}) {
  const { user } = useAuth();
  const location = useLocation();
  return (
    <RecordSession
      key={`${user!.id}:${user!.department?.id}:${location.pathname}:${location.search}`}
      source={service}
    />
  );
}
function RecordSession({ source }: { source: StaffService }) {
  const { user } = useAuth();
  const current = useRef(user);
  current.current = user;
  useEffect(() => {
    current.current = user;
    return () => {
      current.current = null;
    };
  }, [user]);
  const records = useMemo(
    () => source.nursing(async () => current.current),
    [source],
  );
  const nurse = useMemo(
    () => source.nurse(async () => current.current),
    [source],
  );
  const client = useQueryClient();
  const { receptionId, recordId } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const correcting = location.pathname.endsWith('/correct');
  const base = recordKey(user!.id, user!.department?.id);
  // These sensitive queries have no persistence and are removed when unobserved.
  useEffect(
    () => () => {
      void client.cancelQueries({ queryKey: base });
      client.removeQueries({ queryKey: base });
    },
    [client, user!.id, user!.department?.id],
  );
  const detail = useQuery({
    queryKey: [...base, 'detail', recordId],
    queryFn: ({ signal }) => records.detail(recordId!, signal),
    enabled: !!recordId,
    gcTime: 0,
  });
  const selectedId =
    receptionId ?? (params.get('receptionId') || detail.data?.receptionId);
  const reception = useQuery({
    queryKey: [
      ...queryKeys.resource(user!.id, 'nurse-receptions'),
      user!.department?.id,
      'record-context',
      selectedId,
    ],
    queryFn: ({ signal }) => nurse.detail(selectedId!, signal),
    enabled: !!selectedId,
    gcTime: 0,
  });
  const [scope, setScope] = useState<'patient' | 'reception'>('patient');
  const history = useInfiniteQuery({
    queryKey: [
      ...base,
      'history',
      scope,
      reception.data?.patient.id,
      selectedId,
    ],
    queryFn: ({ pageParam, signal }) =>
      scope === 'patient'
        ? records.history(
            reception.data!.patient.id,
            selectedId!,
            { limit: 5, before: pageParam },
            signal,
          )
        : records.list(selectedId!, { limit: 5, before: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextBefore ?? undefined) : undefined,
    enabled: !!reception.data,
    gcTime: 0,
  });
  const selected = reception.data;
  const recordReception = detail.data?.receptionId;
  const mismatched = !!(
    detail.data &&
    selected &&
    recordReception !== selected.id
  );
  // A history record may belong to another date; validate it belongs to the same patient.
  const linked = useQuery({
    queryKey: [...base, 'linked-reception', recordReception],
    queryFn: ({ signal }) => nurse.detail(recordReception!, signal),
    enabled: mismatched,
    gcTime: 0,
  });
  const invalidLink =
    mismatched &&
    linked.data &&
    linked.data.patient.id !== selected?.patient.id;
  const queryError = detail.error ?? reception.error ?? linked.error;
  const path = (id: string, correct = false) =>
    `/nurse/records/${encodeURIComponent(id)}${correct ? '/correct' : ''}?receptionId=${encodeURIComponent(selectedId!)}`;
  const newPath = `/nurse/receptions/${encodeURIComponent(selectedId ?? '')}/records`;
  const [saving, setSaving] = useState(false);
  const [versionNo, setVersionNo] = useState<number | null>(null);
  const version = useQuery({
    queryKey: [...base, 'version', recordId, versionNo],
    queryFn: ({ signal }) => records.version(recordId!, versionNo!, signal),
    enabled: !!recordId && versionNo !== null,
    gcTime: 0,
  });
  const displayed =
    versionNo === null ? detail.data?.latestVersion : version.data;
  return (
    <section
      className="nursing-records"
      data-figma-node={correcting ? '179:1593' : recordId ? '38:2597' : '31:74'}
    >
      <PageHeader
        title="간호 기록"
        description={
          selected
            ? `${selected.patient.name} · ${dateLabel(selected.patient.birthDate)} · ${selected.department.name} · ${selected.doctor.name} · 접수 ${dateTimeLabel(selected.receivedAt)} · ${statusLabels[selected.displayStatus]}`
            : undefined
        }
        actions={
          <>
            {!recordId && selected && (
              <Button
                type="submit"
                form="nursing-record-form"
                disabled={saving}
              >
                {saving ? '저장 중…' : '기록 저장'}
              </Button>
            )}
            {recordId && selected && (
              <Link className="ui-button ui-button--primary" to={newPath}>
                새 기록 작성
              </Link>
            )}
            <Link
              className="record-close"
              aria-label="기록 화면 닫기"
              to="/nurse/patients"
            >
              ×
            </Link>
          </>
        }
      />
      {location.state?.notice && <p role="status">{location.state.notice}</p>}
      {queryError ? (
        <ErrorState
          message={recordError(queryError)}
          onRetry={() => {
            if (recordId) void detail.refetch();
            if (selectedId) void reception.refetch();
            if (mismatched) void linked.refetch();
          }}
        />
      ) : invalidLink ? (
        <ErrorState message="선택한 접수와 기록의 환자가 다릅니다." />
      ) : !selected ||
        (recordId && (!detail.data || (mismatched && !linked.data))) ? (
        <Loading />
      ) : (
        <div className="record-columns">
          <aside aria-label="간호 기록 이력">
            <h2>이전 간호 기록</h2>
            <div
              className="record-scopes"
              role="group"
              aria-label="이력 조회 범위"
            >
              <button
                type="button"
                aria-pressed={scope === 'patient'}
                onClick={() => setScope('patient')}
              >
                환자 전체 이력
              </button>
              <button
                type="button"
                aria-pressed={scope === 'reception'}
                onClick={() => setScope('reception')}
              >
                현재 접수 기록
              </button>
            </div>
            {history.hasNextPage && (
              <button
                className="record-link"
                type="button"
                disabled={history.isFetchingNextPage}
                onClick={() => void history.fetchNextPage()}
              >
                이전 기록 더 보기
              </button>
            )}
            {history.isPending ? (
              <Loading />
            ) : history.isError ? (
              <ErrorState
                message={recordError(history.error)}
                onRetry={() => void history.refetch()}
              />
            ) : (
              <>
                {!history.data?.pages.some((p) => p.data.length) && (
                  <p className="record-muted">등록된 간호 기록이 없습니다.</p>
                )}
                {[...(history.data?.pages ?? [])]
                  .reverse()
                  .flatMap((p) => p.data)
                  .map((r) => (
                    <article
                      className="record-history"
                      key={r.id}
                      aria-current={r.id === recordId ? 'true' : undefined}
                    >
                      <p className="record-muted">
                        {dateTimeLabel(r.createdAt)} · {r.author.name} 간호사
                      </p>
                      <p className="record-context">
                        {r.receptionId === selectedId
                          ? '현재 접수'
                          : '다른 접수'}{' '}
                        · 접수{' '}
                        {dateTimeLabel(r.receivedAt ?? selected.receivedAt)}
                      </p>
                      <p className="record-body">{r.latestVersion.content}</p>
                      <p className="record-context">
                        최신 버전 {r.latestVersion.versionNo}
                      </p>
                      <div className="record-actions">
                        <Link className="record-link" to={path(r.id)}>
                          기록 보기 ›
                        </Link>
                        <Link className="record-link" to={path(r.id, true)}>
                          정정 기록 추가 ›
                        </Link>
                      </div>
                    </article>
                  ))}
              </>
            )}
          </aside>
          <div
            className="record-panel"
            role="region"
            aria-label="간호 기록 본문"
          >
            {!recordId ? (
              <RecordForm
                onPending={setSaving}
                onCreate={(input) => records.create(selectedId!, input)}
                onSaved={(r) =>
                  navigate(path(r.id), {
                    state: { notice: '간호 기록이 저장되었습니다.' },
                  })
                }
              />
            ) : correcting ? (
              <RecordForm
                cancelTo={path(recordId)}
                detail={detail.data!}
                onCorrect={(input) => records.correct(recordId, input)}
                reload={async () => {
                  const latest = await detail.refetch();
                  if (!latest.data || latest.error) throw latest.error;
                  return latest.data;
                }}
                onSaved={() =>
                  navigate(path(recordId), {
                    state: { notice: '정정 기록이 저장되었습니다.' },
                  })
                }
              />
            ) : (
              <>
                <h2>간호 기록</h2>
                {mismatched && (
                  <p className="record-context">
                    다른 접수의 기록 · 접수{' '}
                    {linked.data && dateTimeLabel(linked.data.receivedAt)}. 새
                    기록은 상단에 표시된 현재 접수에 작성합니다.
                  </p>
                )}
                {version.isError ? (
                  <ErrorState
                    message={recordError(version.error)}
                    onRetry={() => void version.refetch()}
                  />
                ) : displayed ? (
                  <RecordVersion version={displayed} />
                ) : (
                  <Loading />
                )}
                <nav className="record-versions" aria-label="기록 버전">
                  {detail.data!.versions.map((v) => (
                    <button
                      type="button"
                      key={v.versionNo}
                      aria-pressed={
                        (versionNo ?? detail.data!.latestVersion.versionNo) ===
                        v.versionNo
                      }
                      onClick={() => setVersionNo(v.versionNo)}
                    >
                      {v.versionNo === 1 ? '원본' : `${v.versionNo - 1}차 정정`}{' '}
                      · {dateTimeLabel(v.createdAt, true)}
                      {v.versionNo === detail.data!.latestVersion.versionNo
                        ? ' (최신)'
                        : ''}
                    </button>
                  ))}
                </nav>
                {displayed?.correctionReason != null && (
                  <div className="record-reason">
                    <p className="record-muted">정정 사유</p>
                    <p className="record-body">{displayed.correctionReason}</p>
                  </div>
                )}
                <Link className="record-link" to={path(recordId, true)}>
                  정정 기록 추가 ›
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
function RecordVersion({ version }: { version: NursingRecordVersion }) {
  return (
    <div className="record-version">
      <p className="record-muted">
        {dateTimeLabel(version.createdAt)} · {version.author.name} 간호사
      </p>
      <p className="record-body">{version.content}</p>
    </div>
  );
}
type FormProps = {
  detail?: NursingRecordDetail;
  cancelTo?: string;
  onPending?: (pending: boolean) => void;
  onCreate?: (input: { content: string }) => Promise<{ id: string }>;
  onCorrect?: (input: {
    baseVersionNo: number;
    content: string;
    correctionReason: string;
  }) => Promise<unknown>;
  reload?: () => Promise<NursingRecordDetail>;
  onSaved: (result: { id: string }) => void;
};
function RecordForm({
  detail,
  cancelTo,
  onPending,
  onCreate,
  onCorrect,
  reload,
  onSaved,
}: FormProps) {
  const [base, setBase] = useState(detail?.latestVersion.versionNo);
  const [content, setContent] = useState(detail?.latestVersion.content ?? '');
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const write = useRecordWrite();
  useEffect(() => {
    onPending?.(write.pending);
  }, [write.pending, onPending]);
  const id = useId();
  const correct = !!detail;
  return (
    <form
      id="nursing-record-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setAttempted(true);
        if (
          !content.trim() ||
          (correct && !reason.trim()) ||
          write.conflict ||
          refreshing
        )
          return;
        void write.run(async () => {
          if (correct) {
            await onCorrect!({
              baseVersionNo: base!,
              content,
              correctionReason: reason,
            });
            return { id: detail.id };
          }
          return onCreate!({ content });
        }, onSaved);
      }}
      aria-busy={write.pending}
    >
      <h2>{correct ? '간호 기록 정정' : '간호 기록 작성'}</h2>
      {correct && <p className="record-muted">확인한 최신 버전: {base}</p>}
      <FormField
        id={`${id}-content`}
        label="기록 내용"
        error={
          attempted && !content.trim()
            ? '기록 내용을 입력해 주세요.'
            : undefined
        }
      >
        <textarea
          className="record-textarea"
          required
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="환자 확인 및 수행한 내용을 입력해 주세요."
          disabled={write.pending}
        />
      </FormField>
      {correct && (
        <FormField
          id={`${id}-reason`}
          label="정정 사유"
          error={
            attempted && !reason.trim()
              ? '정정 사유를 입력해 주세요.'
              : undefined
          }
        >
          <Input
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={write.pending}
          />
        </FormField>
      )}
      {write.error && <p role="alert">{write.error}</p>}
      {write.conflict && (
        <Button
          type="button"
          variant="secondary"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            setRefreshError('');
            try {
              const latest = await reload!();
              setBase(latest.latestVersion.versionNo);
              write.clearConflict();
            } catch (e) {
              setRefreshError(recordError(e));
            } finally {
              setRefreshing(false);
            }
          }}
        >
          최신 기록 다시 조회
        </Button>
      )}
      {refreshError && <p role="alert">{refreshError}</p>}
      {write.conflict && (
        <p>최신 기록 확인 후 작성 중인 내용과 비교해 저장해 주세요.</p>
      )}
      {correct && (
        <div className="record-current">
          <p className="record-muted">
            서버 최신 내용 (버전 {detail.latestVersion.versionNo})
          </p>
          <p className="record-body">{detail.latestVersion.content}</p>
        </div>
      )}
      {correct && (
        <div className="record-form-actions">
          <Link className="record-link" to={cancelTo!}>
            취소
          </Link>
          <Button
            type="submit"
            disabled={write.pending || write.conflict || refreshing}
          >
            {write.pending ? '저장 중…' : '정정 기록 저장'}
          </Button>
        </div>
      )}
    </form>
  );
}
