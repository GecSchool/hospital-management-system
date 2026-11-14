import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import * as controller from '../controllers/reception.controller.js';
import * as query from '../controllers/reception-query.controller.js';

export const receptionRouter = Router();
receptionRouter.get('/', requireAccount, requireRole('STAFF', 'NURSE'), query.listReceptions);
receptionRouter.post('/', requireAccount, requireRole('STAFF'), controller.create);
receptionRouter.get(
  '/:receptionId',
  requireAccount,
  requireRole('STAFF', 'NURSE', 'DOCTOR'),
  query.getReception,
);
receptionRouter.delete('/:receptionId', requireAccount, requireRole('STAFF'), controller.remove);
