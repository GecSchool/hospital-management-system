export const roles = ['STAFF', 'DOCTOR', 'NURSE', 'ADMIN'] as const;
export type Role = (typeof roles)[number];
export const roleLabels: Record<Role, string> = {
  STAFF: '병원 직원',
  DOCTOR: '의사',
  NURSE: '간호사',
  ADMIN: '시스템 관리자',
};
export const roleHome: Record<Role, string> = {
  STAFF: '/staff',
  DOCTOR: '/doctor/schedule',
  NURSE: '/nurse/patients',
  ADMIN: '/admin',
};
export interface DepartmentSummary {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}
interface AccountBase {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'INACTIVE';
  department: DepartmentSummary | null;
}
/** OpenAPI SelfAccount: account id and doctor id are different resources. */
export type SelfAccount = AccountBase &
  (
    | { role: 'DOCTOR'; doctorId: string }
    | { role: Exclude<Role, 'DOCTOR'>; doctorId: null }
  );
export interface LoginRequest {
  email: string;
  password: string;
}
