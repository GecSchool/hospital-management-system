import { useState, type SubmitEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import {
  Button,
  FormField,
  Input,
  Pagination,
  Table,
  type TableColumn,
} from '../../components/ui';
import { ErrorState, Loading } from '../../components/common';
import { PageHeader } from '../../components/layout';
import { useAuth } from '../auth/useAuth';
import { PatientForm } from './PatientForm';
import { MockStaffControls } from './MockStaffControls';
import { dateLabel } from './format';
import { pageFromSearch, staffKeys } from './queries';
import { normalizeDate, staffErrorMessage } from './validation';
import { useStaff } from './useStaff';
import type {
  PatientFilters,
  StaffPatientDetail,
  StaffPatientSummary,
} from './types';

export function PatientListPage() {
  const { user } = useAuth();
  const { service, filters, filterRevision, search } = useStaff();
  const [params, setParams] = useSearchParams();
  const page = pageFromSearch(params);
  const [draft, setDraft] = useState<PatientFilters>(() => filters);
  const [dateError, setDateError] = useState<string>();
  const [registering, setRegistering] = useState(false);
  const [saved, setSaved] = useState<StaffPatientDetail | null>(null);
  const query = useQuery({
    // Opaque revision keeps search PII out of keys, URLs and router history state.
    queryKey: [...staffKeys.patients(user!.id), 'list', filterRevision, page],
    queryFn: ({ signal }) => service.list(filters, { page, size: 5 }, signal),
  });
  function changePage(next: number) {
    setParams({ page: String(next) });
  }
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const birthDate = draft.birthDate?.trim();
    if (birthDate && !normalizeDate(birthDate)) {
      setDateError('생년월일을 YYYY.MM.DD 형식으로 확인해 주세요.');
      return;
    }
    setDateError(undefined);
    setSaved(null);
    const normalized = Object.fromEntries(
      Object.entries(draft)
        .map(([key, value]) => [
          key,
          key === 'birthDate' && value ? normalizeDate(value) : value?.trim(),
        ])
        .filter(([, value]) => value),
    );
    search(normalized);
    changePage(1);
  }
  const columns: TableColumn<StaffPatientSummary>[] = [
    { id: 'number', header: '환자번호', render: (row) => row.patientNumber },
    {
      id: 'name',
      header: '이름',
      render: (row) => (
        <Link
          className="staff-name-link"
          to={`/staff/patients/${encodeURIComponent(row.id)}`}
          state={{ listPage: page }}
        >
          {row.name}
        </Link>
      ),
    },
    {
      id: 'birthDate',
      header: '생년월일',
      render: (row) => dateLabel(row.birthDate),
    },
    { id: 'phone', header: '연락처', render: (row) => row.phone },
    {
      id: 'detail',
      header: <span className="sr-only">상세</span>,
      render: (row) => (
        <Link
          className="staff-text-link"
          to={`/staff/patients/${encodeURIComponent(row.id)}`}
          state={{ listPage: page }}
          aria-label={`${row.name} 상세 보기`}
        >
          상세 보기 ›
        </Link>
      ),
    },
  ];
  return (
    <section className="staff-page staff-patients" data-figma-node="17:107">
      <PageHeader
        title="환자 목록"
        description="환자 정보를 검색하고 등록할 수 있습니다."
        actions={
          <Button
            size="compact"
            onClick={() => {
              setSaved(null);
              setRegistering(true);
            }}
          >
            + 환자 등록
          </Button>
        }
      />
      <section className="patient-search" aria-label="환자 검색">
        <form className="patient-search-fields" noValidate onSubmit={submit}>
          {(['patientNumber', 'name', 'birthDate', 'phone'] as const).map(
            (field, index) => {
              const label = ['환자번호', '이름', '생년월일', '연락처'][index];
              return (
                <FormField
                  key={field}
                  id={`filter-${field}`}
                  label={label}
                  error={field === 'birthDate' ? dateError : undefined}
                >
                  <Input
                    id={`filter-${field}`}
                    autoComplete="off"
                    type={field === 'phone' ? 'tel' : 'text'}
                    placeholder={
                      field === 'birthDate' ? 'YYYY.MM.DD' : `${label} 입력`
                    }
                    value={draft[field] ?? ''}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        [field]: event.target.value,
                      }))
                    }
                  />
                </FormField>
              );
            },
          )}
          <Button size="compact" type="submit">
            검색
          </Button>
        </form>
        <p>조건을 입력하지 않으면 전체 환자가 표시됩니다.</p>
      </section>
      {saved && (
        <p className="staff-notice" role="status">
          환자가 등록되었습니다.{' '}
          <Link
            to={`/staff/patients/${encodeURIComponent(saved.id)}`}
            state={{ listPage: page }}
          >
            등록한 환자 상세 보기
          </Link>
        </p>
      )}
      <section
        className="patient-results"
        aria-labelledby="patient-results-title"
        aria-busy={query.isFetching}
      >
        <div className="staff-section-heading">
          <h2 id="patient-results-title">
            {Object.keys(filters).length ? '검색 결과' : '전체 환자'}
          </h2>
          {query.data && !query.isError && (
            <span>총 {query.data.meta.totalItems}명</span>
          )}
        </div>
        {query.isFetching && !query.isPending && (
          <p className="staff-refresh" role="status">
            목록을 새로 조회하고 있습니다.
          </p>
        )}
        {query.isPending ? (
          <Loading message="환자 목록을 불러오고 있습니다." />
        ) : query.isError ? (
          <ErrorState
            message={staffErrorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <>
            <div className="staff-table staff-table--patients">
              <Table
                caption="환자 목록"
                columns={columns}
                rows={query.data.data}
                rowKey={(row) => row.id}
                emptyMessage="검색 결과가 없습니다."
              />
            </div>
            <Pagination
              page={page}
              totalPages={query.data.meta.totalPages}
              onPageChange={changePage}
            />
            {page > Math.max(1, query.data.meta.totalPages) && (
              <Button
                variant="secondary"
                size="compact"
                onClick={() => changePage(1)}
              >
                첫 페이지로 이동
              </Button>
            )}
          </>
        )}
      </section>
      {registering && (
        <PatientForm
          onClose={() => setRegistering(false)}
          onSaved={(patient) => {
            setRegistering(false);
            setSaved(patient);
            changePage(1);
          }}
        />
      )}
      <MockStaffControls />
    </section>
  );
}
