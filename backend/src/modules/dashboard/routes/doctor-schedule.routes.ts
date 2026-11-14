import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import * as controller from '../controllers/doctor-schedule.controller.js';
/** DASH-02: 의사 전용 일정 조회 경로를 제공한다. */
export const doctorScheduleRouter = Router();
doctorScheduleRouter.get('/me/schedule', requireAccount, requireRole('DOCTOR'), controller.get);
