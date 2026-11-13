import { useState, useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { PageHeader } from '../../components/layout';
import { Button, Input, Select, Table, Pagination } from '../../components/ui';
import { ErrorState, Loading } from '../../components/common';
import { roles, roleLabels, type Role } from '../../types/auth';
import { pageFromSearch } from '../staff/queries';
import { AdminMockControls, useAdmin, adminError } from './AdminWorkspace';
import type { AccountFilters, AccountStatus } from './service';
import { AdminAccountPanel, AdminInviteDialog } from './AdminDialogs';

export function AdminAccountsPage() {
  const { service, base, filters, revision, search } = useAdmin();
  const [draft, setDraft] = useState<AccountFilters>(filters);
  const [params, setParams] = useSearchParams();
  const page = pageFromSearch(params);
  const navigate = useNavigate();
  const { accountId } = useParams();
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState('');
  const scope = useId();
  const query = useQuery({
    queryKey: [...base, 'accounts', revision, page],
    queryFn: ({ signal }) => service.list(filters, { page, size: 4 }, signal),
  });
  const close = () => navigate(`/admin/accounts?page=${page}`);
  return (
    <section className="admin-page" data-figma-node="32:66">
      <PageHeader
        title="계정 관리"
        description={notice || '사용자 계정의 초대 및 상태를 관리합니다.'}
        actions={
          <Button size="compact" onClick={() => setInviting(true)}>
            계정 초대
          </Button>
        }
      />
      {notice && (
        <p role="status" className="sr-only">
          {notice}
        </p>
      )}
      <form
        className="admin-filters"
        onSubmit={(e) => {
          e.preventDefault();
          search({
            name: draft.name?.trim() || undefined,
            email: draft.email?.trim() || undefined,
            role: draft.role || undefined,
            status: draft.status || undefined,
          });
          setParams({ page: '1' });
        }}
      >
        <label htmlFor={`${scope}-name`}>
          이름
          <Input
            id={`${scope}-name`}
            placeholder="이름 입력"
            value={draft.name ?? ''}
            onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
          />
        </label>
        <label htmlFor={`${scope}-email`}>
          이메일
          <Input
            id={`${scope}-email`}
            placeholder="이메일 입력"
            value={draft.email ?? ''}
            onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
          />
        </label>
        <label htmlFor={`${scope}-role`}>
          역할
          <Select
            id={`${scope}-role`}
            value={draft.role ?? ''}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                role: (e.target.value as Role) || undefined,
              }))
            }
          >
            <option value="">전체 역할</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r === 'ADMIN' ? '관리자' : roleLabels[r]}
              </option>
            ))}
          </Select>
        </label>
        <label htmlFor={`${scope}-status`}>
          상태
          <Select
            id={`${scope}-status`}
            value={draft.status ?? ''}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                status: (e.target.value as AccountStatus) || undefined,
              }))
            }
          >
            <option value="">전체 상태</option>
            <option value="ACTIVE">활성</option>
            <option value="INACTIVE">비활성</option>
          </Select>
        </label>
        <Button type="submit" size="compact">
          검색
        </Button>
      </form>
      <section
        className="admin-account-list"
        aria-labelledby="admin-accounts-heading"
      >
        <h2 id="admin-accounts-heading">전체 계정</h2>
        {query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <ErrorState
            message={adminError(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <>
            <div className="admin-table">
              <Table
                caption="계정 목록"
                rows={query.data.data}
                rowKey={(row) => row.id}
                emptyMessage="검색 조건에 맞는 계정이 없습니다."
                columns={[
                  { id: 'name', header: '이름', render: (r) => r.name },
                  { id: 'email', header: '이메일', render: (r) => r.email },
                  {
                    id: 'role',
                    header: '역할',
                    render: (r) =>
                      r.role === 'ADMIN' ? '관리자' : roleLabels[r.role],
                  },
                  {
                    id: 'department',
                    header: '소속',
                    render: (r) => r.department?.name ?? '—',
                  },
                  {
                    id: 'status',
                    header: '상태',
                    render: (r) => (r.status === 'ACTIVE' ? '활성' : '비활성'),
                  },
                  {
                    id: 'action',
                    header: <span className="sr-only">관리</span>,
                    render: (r) => (
                      <Link
                        className="admin-link"
                        aria-label={`${r.name} 관리`}
                        to={`/admin/accounts/${encodeURIComponent(r.id)}?page=${page}`}
                      >
                        관리 ›
                      </Link>
                    ),
                  },
                ]}
              />
            </div>
            <Pagination
              page={page}
              totalPages={query.data.meta.totalPages}
              onPageChange={(p) => setParams({ page: String(p) })}
            />
            {page > 1 && !query.data.data.length && (
              <Button
                variant="secondary"
                onClick={() => setParams({ page: '1' })}
              >
                첫 페이지로 이동
              </Button>
            )}
          </>
        )}
      </section>
      {accountId && (
        <AdminAccountPanel
          key={accountId}
          id={accountId}
          onClose={close}
          onChanged={(text) => {
            setNotice(text);
            close();
          }}
        />
      )}
      {inviting && (
        <AdminInviteDialog
          onClose={() => setInviting(false)}
          onSaved={(text) => {
            setInviting(false);
            setNotice(text);
          }}
        />
      )}
      <AdminMockControls />
    </section>
  );
}
