import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import * as controller from '../controllers/follow-up.controller.js';
export const followUpRouter = Router();
followUpRouter.post(
  '/visits/:visitId/follow-up-appointments',
  requireAccount,
  requireRole('DOCTOR'),
  controller.create,
);
