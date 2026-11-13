import type { Role, SelfAccount } from '../../types/auth';

/** Synthetic accounts only. The session lives in memory and disappears on reload. */
export const mockAccounts: Record<Role, SelfAccount> = {
  STAFF: {
    id: 'demo-staff',
    name: '개발 직원',
    email: 'staff@example.test',
    role: 'STAFF',
    status: 'ACTIVE',
    department: null,
    doctorId: null,
  },
  DOCTOR: {
    id: 'demo-doctor-account',
    name: '개발 의사',
    email: 'doctor@example.test',
    role: 'DOCTOR',
    status: 'ACTIVE',
    department: { id: 'demo-internal', name: '내과', status: 'ACTIVE' },
    doctorId: 'demo-doctor',
  },
  NURSE: {
    id: 'demo-nurse',
    name: '개발 간호사',
    email: 'nurse@example.test',
    role: 'NURSE',
    status: 'ACTIVE',
    department: { id: 'demo-internal', name: '내과', status: 'ACTIVE' },
    doctorId: null,
  },
  ADMIN: {
    id: 'demo-admin',
    name: '개발 관리자',
    email: 'admin@example.test',
    role: 'ADMIN',
    status: 'ACTIVE',
    department: null,
    doctorId: null,
  },
};
/** Development-only credentials. Never sent to or stored by the backend. */
export const mockUsernames: Record<Role, string> = {
  STAFF: 'staff',
  DOCTOR: 'doctor',
  NURSE: 'nurse',
  ADMIN: 'admin',
};
export const mockPassword = '1234';
