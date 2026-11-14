import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import * as service from '../services/admin-dashboard.service.js';
// 관리자 계정·진료과 집계를 공통 응답으로 반환한다.
export const get: RequestHandler = async (_req, res) => {
  sendData(res, await service.getAdminDashboard(res.locals.account as AccountContext));
};
