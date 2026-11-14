import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import { get } from '../controllers/clinical-history.controller.js';
export const clinicalHistoryRouter = Router();
clinicalHistoryRouter.get(
  '/patients/:patientId/clinical-history',
  requireAccount,
  requireRole('DOCTOR'),
  get,
);
