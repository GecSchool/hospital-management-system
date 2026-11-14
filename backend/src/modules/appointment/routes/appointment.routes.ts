import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import * as controller from '../controllers/appointment.controller.js';
import * as query from '../controllers/appointment-query.controller.js';
export const appointmentRouter = Router();
appointmentRouter.get('/', requireAccount, requireRole('STAFF', 'NURSE'), query.listAppointments);
appointmentRouter.post('/', requireAccount, requireRole('STAFF', 'NURSE'), controller.create);
appointmentRouter.get(
  '/:appointmentId',
  requireAccount,
  requireRole('STAFF', 'NURSE', 'DOCTOR'),
  query.getAppointment,
);
appointmentRouter.patch(
  '/:appointmentId/time',
  requireAccount,
  requireRole('STAFF'),
  controller.changeTime,
);
appointmentRouter.post(
  '/:appointmentId/cancel',
  requireAccount,
  requireRole('STAFF'),
  controller.cancel,
);
