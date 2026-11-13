import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import * as controller from '../controllers/patient.controller.js';

export const patientRouter = Router();
patientRouter.get('/', requireAccount, requireRole('STAFF', 'NURSE'), controller.list);
patientRouter.post('/', requireAccount, requireRole('STAFF'), controller.create);
patientRouter.get(
  '/:patientId',
  requireAccount,
  requireRole('STAFF', 'DOCTOR', 'NURSE'),
  controller.get,
);
patientRouter.patch('/:patientId', requireAccount, requireRole('STAFF'), controller.update);
