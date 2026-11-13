import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';
import type { ClinicalService } from './clinicalService';
import { dateLabel } from '../staff/format';
import { ErrorState, Loading } from '../../components/common';

export function ClinicalHistory({
  service,
  patientId,
  base,
  selected,
  path,
  current,
}: {
  service: ClinicalService;
  patientId: string;
  base: (string | null | undefined)[];
  selected?: string | null;
  path: (recordId: string) => string;
  current?: { to: string; label: string };
}) {
  const location = useLocation();
  const history = useInfiniteQuery({
    queryKey: [...base, 'history', patientId],
    queryFn: ({ pageParam, signal }) =>
      service.history(patientId, { limit: 5, before: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextBefore ?? undefined) : undefined,
    gcTime: 0,
  });
  return (
    <aside aria-label="진료 이력">
      <h2>진료 이력</h2>
      {history.hasNextPage && (
        <button
          className="clinical-link clinical-history-more"
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          이전 이력 더 보기
        </button>
      )}
      {history.isPending ? (
        <Loading />
      ) : history.isError ? (
        <ErrorState
          message={history.error.message}
          onRetry={() => void history.refetch()}
        />
      ) : (
        <>
          {!history.data.pages.some((p) => p.data.length) && (
            <p>완료된 진료 이력이 없습니다.</p>
          )}
          {[...history.data.pages]
            .reverse()
            .flatMap((p) => p.data)
            .map((h) => (
              <Link
                key={h.clinicalRecordId}
                to={path(h.clinicalRecordId)}
                state={location.state}
                className="clinical-history"
                aria-current={
                  selected === h.clinicalRecordId ? 'true' : undefined
                }
              >
                <p>
                  {dateLabel(h.completedAt.slice(0, 10))} · {h.department.name}{' '}
                  · {h.doctor.name}
                </p>
                <p className="clinical-text">{h.summary || '진단 요약 없음'}</p>
                {selected === h.clinicalRecordId && (
                  <span>현재 선택한 진료 · 진료 완료</span>
                )}
              </Link>
            ))}
        </>
      )}
      {current && (
        <Link
          className="clinical-history"
          to={current.to}
          state={location.state}
          aria-current={!selected ? 'true' : undefined}
        >
          {current.label}
          <p>현재 선택한 진료 · 진료 중</p>
        </Link>
      )}
    </aside>
  );
}
