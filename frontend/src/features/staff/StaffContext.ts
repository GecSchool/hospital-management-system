import { createContext } from 'react';
import type { StaffService } from './staffService';
import type { PatientFilters } from './types';
export interface StaffContextValue {
  service: StaffService;
  filters: PatientFilters;
  filterRevision: string;
  search(filters: PatientFilters): void;
}
export const StaffContext = createContext<StaffContextValue | null>(null);
