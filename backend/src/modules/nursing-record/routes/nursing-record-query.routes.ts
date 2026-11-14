import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import * as controller from '../controllers/nursing-record-query.controller.js';
export const nursingRecordQueryRouter = Router();
nursingRecordQueryRouter.get(
  '/receptions/:receptionId/nursing-records',
  requireAccount,
  requireRole('DOCTOR', 'NURSE'),
  controller.list,
);
nursingRecordQueryRouter.get(
  '/nursing-records/:recordId',
  requireAccount,
  requireRole('DOCTOR', 'NURSE'),
  controller.get,
);
nursingRecordQueryRouter.get(
  '/nursing-records/:recordId/versions/:versionNo',
  requireAccount,
  requireRole('DOCTOR', 'NURSE'),
  controller.getVersion,
);
