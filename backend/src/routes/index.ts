import { Router } from 'express';
import { accountRouter } from '../modules/account/routes/account.routes.js';

export const apiRouter = Router();
apiRouter.use('/accounts', accountRouter);
