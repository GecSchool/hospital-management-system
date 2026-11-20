import { useEffect } from 'react';
import { matchPath, useLocation } from 'react-router';

const pageTitles: Array<[string, string]> = [
  ['/login', '로그인'],
  ['/invitations/accept', '계정 가입'],
  ['/password-reset', '비밀번호 재설정'],
  ['/staff', '직원 대시보드'],
  ['/staff/patients', '환자 관리'],
  ['/staff/patients/:patientId', '환자 상세'],
  ['/staff/appointments', '예약 현황'],
  ['/staff/appointments/new', '예약 등록'],
  ['/staff/appointments/:appointmentId/reschedule', '예약 변경'],
  ['/staff/appointments/:appointmentId', '예약 상세'],
  ['/staff/receptions', '접수 현황'],
  ['/staff/receptions/:receptionId', '접수 상세'],
  ['/doctor', '진료 일정'],
  ['/doctor/schedule', '진료 일정'],
  ['/doctor/schedule/day', '일간 진료 일정'],
  ['/doctor/availability', '진료 가능 시간'],
  ['/doctor/patients', '환자 진료'],
  ['/doctor/visits/:visitId', '환자 진료'],
  ['/doctor/visits/:visitId/follow-up', '재진 예약'],
  ['/doctor/records/:recordId/correct', '진료 기록 정정'],
  ['/nurse', '접수 환자 현황'],
  ['/nurse/patients', '접수 환자 현황'],
  ['/nurse/receptions/:receptionId', '접수 상세'],
  ['/nurse/receptions/:receptionId/records', '간호 기록'],
  ['/nurse/records/:recordId', '간호 기록'],
  ['/nurse/records/:recordId/correct', '간호 기록 정정'],
  ['/nurse/appointments', '예약 현황'],
  ['/nurse/appointments/new', '예약 등록'],
  ['/nurse/appointments/new/:patientId', '예약 등록'],
  ['/nurse/appointments/:appointmentId', '예약 상세'],
  ['/admin', '관리자 대시보드'],
  ['/admin/accounts', '계정 관리'],
  ['/admin/accounts/:accountId', '계정 상세'],
  ['/admin/departments', '진료과·의료진 관리'],
  ['/403', '접근 권한 없음'],
];

export function PageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const title = pageTitles.find(([path]) => matchPath(path, pathname))?.[1];
    document.title = title
      ? `${title} | 숭실대 병원`
      : pathname === '/'
        ? '병원 진료 예약 및 환자 관리 시스템'
        : '페이지를 찾을 수 없음 | 숭실대 병원';
  }, [pathname]);
  return null;
}
