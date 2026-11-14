import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import { getVisit } from '../controllers/visit-query.controller.js';
export const visitQueryRouter = Router();
visitQueryRouter.get('/:visitId', requireAccount, requireRole('DOCTOR'), getVisit);
