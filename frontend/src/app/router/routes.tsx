import './routeStyles';
import { lazy, Suspense, type ReactNode } from 'react';
import { AdminWorkspace } from '../../features/admin/AdminWorkspace';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router';
import {
  AuthLayout,
  StaffLayout,
  DoctorLayout,
  NurseLayout,
  AdminLayout,
} from '../../components/layout';
import { ErrorState, Loading } from '../../components/common';
import { AuthLinkPage } from '../../features/auth/AuthLinkPage';
import { LoginPage } from '../../features/auth/LoginPage';
import { useAuth } from '../../features/auth/useAuth';
import { roleHome } from '../../types/auth';
import { ProtectedRoute } from './ProtectedRoute';
import { StaffWorkspace } from '../../features/staff/StaffWorkspace';
import type { StaffService } from '../../features/staff/staffService';
import { StaffDashboardPage } from '../../features/staff/StaffDashboardPage';
import { PatientListPage } from '../../features/staff/PatientListPage';
import { PatientDetailPage } from '../../features/staff/PatientDetailPage';
import { AppointmentListPage } from '../../features/appointments/AppointmentListPage';
import { AppointmentFormPage } from '../../features/appointments/AppointmentFormPage';
import { ReceptionListPage } from '../../features/receptions/ReceptionListPage';

// Keep staff request-start/loading timing eager; defer the other role entries.
const DoctorPage = lazy(() =>
  import('./pages/doctor').then((m) => ({ default: m.DoctorPage })),
);
const ClinicalPage = lazy(() =>
  import('./pages/doctor').then((m) => ({ default: m.ClinicalPage })),
);
const RecordCorrectionPage = lazy(() =>
  import('./pages/doctor').then((m) => ({ default: m.RecordCorrectionPage })),
);
const FollowUpPage = lazy(() =>
  import('./pages/doctor').then((m) => ({ default: m.FollowUpPage })),
);
const NursePage = lazy(() =>
  import('./pages/nurse').then((m) => ({ default: m.NursePage })),
);
const NurseBookingPage = lazy(() =>
  import('./pages/nurse').then((m) => ({ default: m.NurseBookingPage })),
);
const NursingRecordsPage = lazy(() =>
  import('./pages/nurse').then((m) => ({ default: m.NursingRecordsPage })),
);
const AdminDashboardPage = lazy(() =>
  import('./pages/admin').then((m) => ({ default: m.AdminDashboardPage })),
);
const AdminAccountsPage = lazy(() =>
  import('./pages/admin').then((m) => ({ default: m.AdminAccountsPage })),
);
const DepartmentsPage = lazy(() =>
  import('./pages/admin').then((m) => ({ default: m.DepartmentsPage })),
);

// Suspense stays inside each existing protected route and layout; URL/route hierarchy is unchanged.
function deferredPage(page: ReactNode) {
  return <Suspense fallback={<Loading />}>{page}</Suspense>;
}

function AuthLinkRoute({ kind }: { kind: 'invitation' | 'reset' }) {
  const { pathname, search } = useLocation();
  const demo = new URLSearchParams(search).get('demo');
  return <AuthLinkPage key={`${pathname}:${demo}`} kind={kind} />;
}

function HomeRedirect() {
  const { user, status, error, retry } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status === 'error')
    return <ErrorState message={error ?? undefined} onRetry={retry} />;
  return <Navigate to={user ? roleHome[user.role] : '/login'} replace />;
}
function StatusPage({ code }: { code: 403 | 404 }) {
  const { user } = useAuth();
  return (
    <main className="status-page">
      <h1>{code}</h1>
      <p>
        {code === 403
          ? '이 화면에 접근할 권한이 없습니다.'
          : '요청한 페이지를 찾을 수 없습니다.'}
      </p>
      <Link to={user ? roleHome[user.role] : '/login'}>시작 화면으로 이동</Link>
    </main>
  );
}
export function AppRoutes({
  staffService,
}: { staffService?: StaffService } = {}) {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/invitations/accept"
          element={<AuthLinkRoute kind="invitation" />}
        />
        <Route
          path="/password-reset"
          element={<AuthLinkRoute kind="reset" />}
        />
      </Route>
      <Route element={<ProtectedRoute roles={['STAFF']} />}>
        <Route element={<StaffWorkspace service={staffService} />}>
          <Route path="/staff" element={<StaffLayout />}>
            <Route index element={<StaffDashboardPage />} />
            <Route path="patients" element={<PatientListPage />} />
            <Route path="patients/:patientId" element={<PatientDetailPage />} />
            <Route path="appointments" element={<AppointmentListPage />} />
            <Route path="appointments/new" element={<AppointmentFormPage />} />
            <Route
              path="appointments/:appointmentId"
              element={<AppointmentListPage />}
            />
            <Route
              path="appointments/:appointmentId/reschedule"
              element={<AppointmentFormPage />}
            />
            <Route path="receptions" element={<ReceptionListPage />} />
            <Route
              path="receptions/:receptionId"
              element={<ReceptionListPage />}
            />
          </Route>
        </Route>
      </Route>
      <Route element={<ProtectedRoute roles={['DOCTOR']} />}>
        <Route
          path="/doctor"
          element={
            <div className="doctor-scope">
              <DoctorLayout />
            </div>
          }
        >
          <Route index element={<Navigate to="schedule" replace />} />
          <Route
            path="schedule"
            element={deferredPage(<DoctorPage service={staffService} />)}
          />
          <Route
            path="schedule/day"
            element={deferredPage(<DoctorPage service={staffService} />)}
          />
          <Route
            path="patients"
            element={deferredPage(<ClinicalPage service={staffService} />)}
          />
          <Route
            path="visits/:visitId"
            element={deferredPage(<ClinicalPage service={staffService} />)}
          />
          <Route
            path="records/:recordId/correct"
            element={deferredPage(
              <RecordCorrectionPage service={staffService} />,
            )}
          />
          <Route
            path="visits/:visitId/follow-up"
            element={deferredPage(<FollowUpPage service={staffService} />)}
          />
          <Route
            path="availability"
            element={deferredPage(<DoctorPage service={staffService} />)}
          />
        </Route>
      </Route>
      <Route element={<ProtectedRoute roles={['NURSE']} />}>
        <Route
          path="/nurse"
          element={
            <div className="nurse-scope">
              <NurseLayout />
            </div>
          }
        >
          <Route index element={<Navigate to="patients" replace />} />
          <Route
            path="patients"
            element={deferredPage(<NursePage service={staffService} />)}
          />
          <Route
            path="receptions/:receptionId"
            element={deferredPage(<NursePage service={staffService} />)}
          />
          <Route
            path="receptions/:receptionId/records"
            element={deferredPage(
              <NursingRecordsPage service={staffService} />,
            )}
          />
          <Route
            path="records/:recordId"
            element={deferredPage(
              <NursingRecordsPage service={staffService} />,
            )}
          />
          <Route
            path="records/:recordId/correct"
            element={deferredPage(
              <NursingRecordsPage service={staffService} />,
            )}
          />
          <Route
            path="appointments"
            element={deferredPage(<NurseBookingPage service={staffService} />)}
          />
          <Route
            path="appointments/:appointmentId"
            element={deferredPage(<NurseBookingPage service={staffService} />)}
          />
          <Route
            path="appointments/new"
            element={deferredPage(<NurseBookingPage service={staffService} />)}
          />
          <Route
            path="appointments/new/:patientId"
            element={deferredPage(<NurseBookingPage service={staffService} />)}
          />
        </Route>
      </Route>
      <Route element={<ProtectedRoute roles={['ADMIN']} />}>
        <Route
          path="/admin"
          element={
            <AdminWorkspace source={staffService}>
              <AdminLayout />
            </AdminWorkspace>
          }
        >
          <Route index element={deferredPage(<AdminDashboardPage />)} />
          <Route
            path="accounts"
            element={deferredPage(<AdminAccountsPage />)}
          />
          <Route
            path="accounts/:accountId"
            element={deferredPage(<AdminAccountsPage />)}
          />
          <Route
            path="departments"
            element={deferredPage(<DepartmentsPage />)}
          />
        </Route>
      </Route>
      <Route path="/403" element={<StatusPage code={403} />} />
      <Route path="/404" element={<StatusPage code={404} />} />
      <Route path="*" element={<StatusPage code={404} />} />
    </Routes>
  );
}
