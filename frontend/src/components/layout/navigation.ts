import type { Role } from '../../types/auth';

export interface NavigationItem {
  label: string;
  to: string;
  end?: boolean;
  relatedPaths?: readonly string[];
}

// Menu labels follow the current role screens, which differ from some older library variants.
export const roleNavigation: Record<Role, readonly NavigationItem[]> = {
  STAFF: [
    { label: '대시보드', to: '/staff', end: true },
    { label: '환자 관리', to: '/staff/patients' },
    {
      label: '예약·접수 현황',
      to: '/staff/receptions',
      relatedPaths: ['/staff/appointments'],
    },
  ],
  DOCTOR: [
    { label: '진료 일정', to: '/doctor/schedule' },
    {
      label: '환자 진료',
      to: '/doctor/patients',
      relatedPaths: ['/doctor/records', '/doctor/visits'],
    },
    { label: '진료 시간 설정', to: '/doctor/availability' },
  ],
  NURSE: [
    {
      label: '접수 환자',
      to: '/nurse/patients',
      relatedPaths: ['/nurse/records', '/nurse/receptions'],
    },
    { label: '예약 등록', to: '/nurse/appointments/new' },
  ],
  ADMIN: [
    { label: '대시보드', to: '/admin', end: true },
    { label: '계정 관리', to: '/admin/accounts' },
    { label: '진료과·의료진', to: '/admin/departments' },
  ],
};
