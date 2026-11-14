import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import { parseDoctorScheduleQuery } from '../validations/doctor-schedule.validation.js';
import { getDoctorSchedule } from '../services/doctor-schedule.service.js';
/** DASH-02: 유효한 날짜와 인증된 의사를 사용해 일정 응답을 반환한다. */
export const get: RequestHandler = async (req, res) => {
  const { from, to } = parseDoctorScheduleQuery(req.query);
  sendData(res, await getDoctorSchedule(res.locals.account as AccountContext, from, to));
};
