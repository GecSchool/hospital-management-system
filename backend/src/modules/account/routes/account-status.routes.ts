import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import { changeStatus } from '../controllers/account-status.controller.js';

export const accountStatusRouter = Router();
accountStatusRouter.patch('/:accountId/status', requireAccount, requireRole('ADMIN'), changeStatus);
