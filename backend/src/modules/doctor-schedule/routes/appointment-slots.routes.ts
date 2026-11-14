import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import { get } from '../controllers/appointment-slots.controller.js';
export const appointmentSlotsRouter = Router();
appointmentSlotsRouter.get(
  '/doctors/:doctorId/appointment-slots',
  requireAccount,
  requireRole('STAFF', 'NURSE', 'DOCTOR'),
  get,
);
