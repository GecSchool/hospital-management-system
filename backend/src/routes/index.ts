import { Router } from 'express';
import { accountRouter } from '../modules/account/routes/account.routes.js';
import { medicalStaffRouter } from '../modules/medical-staff/routes/medical-staff.routes.js';

export const apiRouter = Router();
apiRouter.use('/accounts', accountRouter);
apiRouter.use(medicalStaffRouter);
