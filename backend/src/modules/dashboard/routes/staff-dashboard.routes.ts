import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import { getStaffDashboard } from '../controllers/staff-dashboard.controller.js';
// DASH-01: 직원만 대시보드에 접근한다.
export const staffDashboardRouter = Router();
staffDashboardRouter.get(
  '/dashboards/staff',
  requireAccount,
  requireRole('STAFF'),
  getStaffDashboard,
);
