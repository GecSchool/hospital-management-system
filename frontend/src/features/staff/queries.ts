import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../services/api/queryKeys';
import type { StaffPatientDetail } from './types';
export const staffKeys = {
  patients: (accountId: string) =>
    queryKeys.resource(accountId, 'staff-patients'),
  detail: (accountId: string, id: string) =>
    [...queryKeys.resource(accountId, 'staff-patients'), 'detail', id] as const,
  dashboard: (accountId: string) =>
    queryKeys.resource(accountId, 'staff-dashboard'),
};
export async function refreshPatient(
  client: QueryClient,
  accountId: string,
  patient: StaffPatientDetail,
  isCurrent: () => boolean,
) {
  // Cancel stale reads before publishing the mutation result to all affected views.
  await Promise.all([
    client.cancelQueries({
      queryKey: queryKeys.resource(accountId, 'staff-receptions'),
    }),
    client.cancelQueries({ queryKey: staffKeys.patients(accountId) }),
    client.cancelQueries({ queryKey: staffKeys.dashboard(accountId) }),
    client.cancelQueries({
      queryKey: queryKeys.resource(accountId, 'staff-appointments'),
    }),
  ]);
  if (!isCurrent()) return;
  client.setQueryData(staffKeys.detail(accountId, patient.id), patient);
  await Promise.all([
    client.invalidateQueries({
      queryKey: queryKeys.resource(accountId, 'staff-receptions'),
    }),
    client.invalidateQueries({ queryKey: staffKeys.patients(accountId) }),
    client.invalidateQueries({ queryKey: staffKeys.dashboard(accountId) }),
    client.invalidateQueries({
      queryKey: queryKeys.resource(accountId, 'staff-appointments'),
    }),
  ]);
}
export function pageFromSearch(search: URLSearchParams) {
  const raw = search.get('page') ?? '1';
  const page = Number(raw);
  return /^\d+$/.test(raw) && Number.isSafeInteger(page) && page > 0 ? page : 1;
}
