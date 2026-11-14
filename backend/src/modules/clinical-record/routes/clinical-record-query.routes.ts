import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import * as controller from '../controllers/clinical-record-query.controller.js';
export const clinicalRecordQueryRouter = Router();
clinicalRecordQueryRouter.get(
  '/clinical-records/:recordId',
  requireAccount,
  requireRole('DOCTOR'),
  controller.get,
);
clinicalRecordQueryRouter.get(
  '/clinical-records/:recordId/versions/:versionNo',
  requireAccount,
  requireRole('DOCTOR'),
  controller.getVersion,
);
