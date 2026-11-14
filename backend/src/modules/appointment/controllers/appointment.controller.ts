import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import {
  parseAppointmentCreate,
  parseAppointmentId,
  parseAppointmentTime,
} from '../validations/appointment.validation.js';
import * as service from '../services/appointment.service.js';
// APT-01: 요청 검증 후 세션 사용자로 등록하고 201을 반환한다.
export const create: RequestHandler = async (req, res) => {
  sendData(
    res,
    await service.createAppointment(
      res.locals.account as AccountContext,
      parseAppointmentCreate(req.body),
    ),
    201,
  );
};
// APT-04: 요청 검증 후 직원의 예약 시간을 변경하고 200을 반환한다.
export const changeTime: RequestHandler = async (req, res) => {
  sendData(
    res,
    await service.changeAppointmentTime(
      res.locals.account as AccountContext,
      parseAppointmentId(req.params.appointmentId),
      parseAppointmentTime(req.body),
    ),
  );
};
// APT-05: 직원의 예약 취소 결과를 200으로 반환한다.
export const cancel: RequestHandler = async (req, res) => {
  sendData(
    res,
    await service.cancelAppointment(
      res.locals.account as AccountContext,
      parseAppointmentId(req.params.appointmentId),
    ),
  );
};
