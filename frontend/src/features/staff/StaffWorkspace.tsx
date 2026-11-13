import { useId, useState } from 'react';
import { Outlet } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { StaffContext } from './StaffContext';
import { staffService } from './service';
import type { StaffService } from './staffService';
import type { PatientFilters } from './types';
import './staff.css';

export function StaffWorkspace({
  service = staffService,
}: {
  service?: StaffService;
}) {
  const { user } = useAuth();
  return <WorkspaceSession key={user?.id} service={service} />;
}
function WorkspaceSession({ service }: { service: StaffService }) {
  const scopeId = useId();
  const [criteria, setCriteria] = useState<{
    filters: PatientFilters;
    revision: number;
  }>({ filters: {}, revision: 0 });
  return (
    <StaffContext.Provider
      value={{
        service,
        filters: criteria.filters,
        filterRevision: `${scopeId}:${criteria.revision}`,
        search: (filters) =>
          setCriteria((previous) => ({
            filters,
            revision: previous.revision + 1,
          })),
      }}
    >
      <div className="staff-workspace">
        <Outlet />
      </div>
    </StaffContext.Provider>
  );
}
