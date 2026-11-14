import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import { get } from '../controllers/nursing-history.controller.js';
export const nursingHistoryRouter = Router();
nursingHistoryRouter.get(
  '/patients/:patientId/nursing-records',
  requireAccount,
  requireRole('NURSE'),
  get,
);
