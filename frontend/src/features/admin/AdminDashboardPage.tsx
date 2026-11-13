import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { PageHeader } from '../../components/layout';
import { ErrorState, Loading, EmptyState } from '../../components/common';
import { useAdmin, AdminMockControls, adminError } from './AdminWorkspace';
import { roles, roleLabels } from '../../types/auth';

export function AdminDashboardPage() {
  const { service, base } = useAdmin();
  const query = useQuery({
    queryKey: [...base, 'dashboard'],
    queryFn: ({ signal }) => service.dashboard(signal),
  });
  return (
    <section className="admin-page" data-figma-node="32:4">
      <PageHeader
        title="관리자 대시보드"
        description="계정과 진료과의 운영 현황을 확인합니다."
      />
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState
          message={adminError(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <section
            className="admin-metrics-section"
            aria-labelledby="admin-role-counts"
          >
            <h2 id="admin-role-counts">역할별 활성 계정</h2>
            <dl className="admin-metrics admin-role-metrics">
              {roles.map((role) => (
                <div key={role}>
                  <dt>{role === 'ADMIN' ? '관리자' : roleLabels[role]}</dt>
                  <dd>
                    <strong>{query.data.accountsByRole[role]}</strong>
                    <span>건</span>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <section
            className="admin-metrics-section admin-department-metrics"
            aria-labelledby="admin-department-counts"
          >
            <h2 id="admin-department-counts">진료과 현황</h2>
            <dl className="admin-metrics">
              {(['ACTIVE', 'INACTIVE'] as const).map((status) => (
                <div key={status}>
                  <dt>{status === 'ACTIVE' ? '활성' : '비활성'} 진료과</dt>
                  <dd>
                    <strong>{query.data.departmentsByStatus[status]}</strong>
                    <span>건</span>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          {Object.values(query.data.accountsByRole).every((n) => n === 0) &&
            Object.values(query.data.departmentsByStatus).every(
              (n) => n === 0,
            ) && <EmptyState title="집계할 계정과 진료과가 없습니다." />}
        </>
      )}
      <nav className="admin-shortcuts" aria-label="관리자 바로가기">
        <Link to="/admin/accounts">계정 관리 ›</Link>
        <Link to="/admin/departments">진료과·의료진 관리 ›</Link>
      </nav>
      <AdminMockControls />
    </section>
  );
}
