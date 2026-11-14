import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import * as controller from '../controllers/availability.controller.js';
export const availabilityRouter = Router();
availabilityRouter.get(
  '/doctors/:doctorId/availability',
  requireAccount,
  requireRole('DOCTOR', 'STAFF', 'NURSE'),
  controller.get,
);
availabilityRouter.put(
  '/doctors/me/availability',
  requireAccount,
  requireRole('DOCTOR'),
  controller.replace,
);
