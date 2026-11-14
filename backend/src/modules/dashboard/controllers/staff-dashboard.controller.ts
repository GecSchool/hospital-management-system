import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import { parseStaffDashboardDate } from '../validations/staff-dashboard.validation.js';
import * as service from '../services/staff-dashboard.service.js';
// DASH-01: 인증 계정과 날짜를 서비스에 전달하고 공통 성공 응답을 반환한다.
export const getStaffDashboard: RequestHandler = async (req, res) => {
  sendData(
    res,
    await service.getStaffDashboard(
      res.locals.account as AccountContext,
      parseStaffDashboardDate(req.query),
    ),
  );
};
