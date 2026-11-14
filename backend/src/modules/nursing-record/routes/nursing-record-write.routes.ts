import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import * as controller from '../controllers/nursing-record-write.controller.js';
export const nursingRecordWriteRouter = Router();
nursingRecordWriteRouter.post(
  '/receptions/:receptionId/nursing-records',
  requireAccount,
  requireRole('NURSE'),
  controller.create,
);
nursingRecordWriteRouter.post(
  '/nursing-records/:recordId/versions',
  requireAccount,
  requireRole('NURSE'),
  controller.correct,
);
