import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import * as controller from '../controllers/admin-dashboard.controller.js';
export const adminDashboardRouter = Router();
adminDashboardRouter.get('/admin', requireAccount, requireRole('ADMIN'), controller.get);
