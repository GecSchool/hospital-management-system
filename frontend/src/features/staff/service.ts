import { apiMode } from '../../services/mode';
import { apiStaffService } from './apiStaffService';
import type { StaffService } from './staffService';
// Production excludes all synthetic patient data. API errors never fall back to mock.
export const staffService: StaffService =
  import.meta.env.DEV && apiMode === 'mock'
    ? (await import('../../services/mock/staff')).createMockStaffService()
    : apiStaffService;
