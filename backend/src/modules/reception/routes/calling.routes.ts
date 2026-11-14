import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import * as controller from '../controllers/calling.controller.js';
export const callingRouter = Router();
callingRouter.post(
  '/receptions/:receptionId/call',
  requireAccount,
  requireRole('NURSE'),
  controller.call,
);
callingRouter.post(
  '/receptions/:receptionId/confirm-entry',
  requireAccount,
  requireRole('NURSE'),
  controller.confirm,
);
