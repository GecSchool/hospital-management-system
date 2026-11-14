import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import * as controller from '../controllers/clinical-record-write.controller.js';
export const clinicalRecordWriteRouter = Router();
clinicalRecordWriteRouter.post(
  '/visits/:visitId/complete',
  requireAccount,
  requireRole('DOCTOR'),
  controller.complete,
);
clinicalRecordWriteRouter.post(
  '/clinical-records/:recordId/versions',
  requireAccount,
  requireRole('DOCTOR'),
  controller.correct,
);
