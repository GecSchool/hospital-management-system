import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import {
  parseAppointmentId,
  parseAppointmentQuery,
} from '../validations/appointment-query.validation.js';
import * as service from '../services/appointment-query.service.js';
// 각 요청의 인증된 역할과 입력을 검증해 서비스 결과를 공통 응답으로 변환한다.
export const listAppointments: RequestHandler = async (req, res) => {
  const result = await service.listAppointments(
    res.locals.account as AccountContext,
    parseAppointmentQuery(req.query),
  );
  sendData(res, result.data, 200, result.meta);
};
export const getAppointment: RequestHandler = async (req, res) => {
  sendData(
    res,
    await service.getAppointment(
      res.locals.account as AccountContext,
      parseAppointmentId(req.params.appointmentId),
    ),
  );
};
