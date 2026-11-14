import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import * as controller from '../controllers/leave.controller.js';
// SCH-03/04는 역할·계정 검증 후 처리한다.
export const leaveRouter = Router();
leaveRouter.get(
  '/doctors/:doctorId/leaves',
  requireAccount,
  requireRole('DOCTOR', 'STAFF', 'NURSE'),
  controller.list,
);
leaveRouter.post('/doctors/me/leaves', requireAccount, requireRole('DOCTOR'), controller.create);
