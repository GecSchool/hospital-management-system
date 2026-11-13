import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { PageHeader } from '../../components/layout';
import { Button, Select, Table, Pagination } from '../../components/ui';
import { EmptyState, ErrorState, Loading } from '../../components/common';
import type { Role } from '../../types/auth';
import { roleLabels } from '../../types/auth';
import { pageFromSearch } from '../staff/queries';
import type { AccountStatus } from './service';
import { useAdmin, adminError, AdminMockControls } from './AdminWorkspace';
import { DepartmentDialog, type DepartmentAction } from './DepartmentDialog';
import './departments.css';

export function DepartmentsPage() {
  const { departments: service, base } = useAdmin();
  const [params, setParams] = useSearchParams();
  const status = (
    ['ACTIVE', 'INACTIVE'].includes(params.get('status') ?? '')
      ? params.get('status')
      : undefined
  ) as AccountStatus | undefined;
  const role = (
    ['DOCTOR', 'NURSE'].includes(params.get('role') ?? '')
      ? params.get('role')
      : undefined
  ) as Role | undefined;
  const page = pageFromSearch(params);
  const [action, setAction] = useState<DepartmentAction | null>(null);
  const [notice, setNotice] = useState('');
  const list = useQuery({
    queryKey: [...base, 'departments', status ?? 'ALL'],
    queryFn: ({ signal }) => service.list(status, signal),
  });
  const selected =
    list.data?.find((d) => d.id === params.get('department')) ?? list.data?.[0];
  const staff = useQuery({
    queryKey: [...base, 'medical-staff', selected?.id, role ?? 'ALL', page],
    enabled: list.isSuccess && !!selected,
    queryFn: ({ signal }) =>
      service.medicalStaff(selected!.id, role, { page, size: 3 }, signal),
  });
  function change(values: Record<string, string | undefined>) {
    setParams((old) => {
      const next = new URLSearchParams(old);
      for (const [key, value] of Object.entries(values)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    });
  }
  return (
    <section className="admin-page department-page" data-figma-node="32:138">
      <PageHeader
        title="진료과·의료진 관리"
        description="진료과와 소속 의료진을 관리합니다."
        actions={
          <Button size="compact" onClick={() => setAction({ kind: 'create' })}>
            진료과 등록
          </Button>
        }
      />
      {notice && (
        <p className="department-notice" role="status">
          {notice}
        </p>
      )}
      <div className="department-grid">
        <section
          aria-labelledby="department-list-title"
          className="department-list"
        >
          <div className="department-list-heading">
            <h2 id="department-list-title">진료과</h2>
            <label>
              상태
              <Select
                aria-label="진료과 상태"
                value={status ?? ''}
                onChange={(e) =>
                  change({
                    status: e.target.value || undefined,
                    department: undefined,
                    page: '1',
                  })
                }
              >
                <option value="">전체</option>
                <option value="ACTIVE">활성</option>
                <option value="INACTIVE">비활성</option>
              </Select>
            </label>
          </div>
          {list.isPending ? (
            <Loading />
          ) : list.isError ? (
            <ErrorState
              message={adminError(list.error)}
              onRetry={() => void list.refetch()}
            />
          ) : !list.data.length ? (
            <EmptyState title="조건에 맞는 진료과가 없습니다." />
          ) : (
            <ul>
              {list.data.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    aria-label={`${d.name} ${d.status === 'ACTIVE' ? '활성' : '비활성'}`}
                    aria-pressed={selected?.id === d.id}
                    onClick={() => change({ department: d.id, page: '1' })}
                  >
                    <span>{d.name}</span>
                    <span>{d.status === 'ACTIVE' ? '활성' : '비활성'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {list.isSuccess && selected && (
          <section className="department-detail" aria-label="선택 진료과">
            <header className="department-detail-heading">
              <div>
                <h2>{selected.name}</h2>
                <p>{selected.status === 'ACTIVE' ? '활성' : '비활성'}</p>
              </div>
              <div className="department-actions">
                <Button
                  variant="secondary"
                  size="compact"
                  onClick={() =>
                    setAction({ kind: 'rename', department: selected })
                  }
                >
                  수정
                </Button>
                <Button
                  variant="secondary"
                  size="compact"
                  onClick={() =>
                    setAction({ kind: 'status', department: selected })
                  }
                >
                  {selected.status === 'ACTIVE' ? '비활성화' : '활성화'}
                </Button>
                <Button
                  variant="secondary"
                  size="compact"
                  onClick={() =>
                    setAction({ kind: 'delete', department: selected })
                  }
                >
                  삭제
                </Button>
              </div>
            </header>
            <div className="department-staff-heading">
              <h3>소속 의료진</h3>
              <label>
                역할
                <Select
                  aria-label="의료진 역할"
                  value={role ?? ''}
                  onChange={(e) =>
                    change({ role: e.target.value || undefined, page: '1' })
                  }
                >
                  <option value="">전체</option>
                  <option value="DOCTOR">의사</option>
                  <option value="NURSE">간호사</option>
                </Select>
              </label>
            </div>
            {staff.isPending ? (
              <Loading />
            ) : staff.isError ? (
              <ErrorState
                message={adminError(staff.error)}
                onRetry={() => void staff.refetch()}
              />
            ) : (
              <>
                <div className="department-staff-table">
                  <Table
                    caption="소속 의료진"
                    rows={staff.data.data}
                    rowKey={(a) => a.id}
                    emptyMessage="조건에 맞는 소속 의료진이 없습니다."
                    columns={[
                      {
                        id: 'name',
                        header: '의료진',
                        render: (a) => (
                          <>
                            <span>{a.name}</span>
                            <small>{a.email}</small>
                          </>
                        ),
                      },
                      {
                        id: 'role',
                        header: '역할',
                        render: (a) => roleLabels[a.role],
                      },
                      {
                        id: 'status',
                        header: '계정 상태',
                        render: (a) =>
                          a.status === 'ACTIVE' ? '활성' : '비활성',
                      },
                      {
                        id: 'move',
                        header: '관리',
                        render: (a) => (
                          <button
                            className="department-link"
                            type="button"
                            aria-label={`${a.name} 소속 변경`}
                            onClick={() =>
                              setAction({
                                kind: 'move',
                                account: a,
                                department: selected,
                              })
                            }
                          >
                            소속 변경 ›
                          </button>
                        ),
                      },
                    ]}
                  />
                </div>
                <Pagination
                  page={page}
                  totalPages={staff.data.meta.totalPages}
                  onPageChange={(p) => change({ page: String(p) })}
                />
                {page > 1 && !staff.data.data.length && (
                  <Button
                    variant="secondary"
                    onClick={() => change({ page: '1' })}
                  >
                    첫 페이지로 이동
                  </Button>
                )}
              </>
            )}
            <div className="department-rules">
              <p>소속 의료진이 없을 때 비활성화할 수 있습니다.</p>
              <p>소속 의료진과 관련 진료 건이 없을 때 삭제할 수 있습니다.</p>
            </div>
          </section>
        )}
      </div>
      {action && (
        <DepartmentDialog
          action={action}
          onClose={() => setAction(null)}
          onSaved={(message, department) => {
            setAction(null);
            setNotice(message);
            if (action.kind === 'delete')
              change({ department: undefined, page: '1' });
            else if (department)
              change({
                department: department.id,
                status: undefined,
                page: '1',
              });
          }}
        />
      )}
      <AdminMockControls />
    </section>
  );
}
