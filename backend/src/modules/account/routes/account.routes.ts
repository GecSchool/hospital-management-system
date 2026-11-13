import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import * as accountController from '../controllers/account.controller.js';
import { accountStatusRouter } from './account-status.routes.js';

export const accountRouter = Router();

accountRouter.get('/', requireAccount, requireRole('ADMIN'), accountController.list);
accountRouter.get('/:accountId', requireAccount, requireRole('ADMIN'), accountController.get);
accountRouter.use(accountStatusRouter);
