import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import { parseAppointmentId, parseAppointmentTime } from '../validations/appointment.validation.js';
import { createFollowUp } from '../services/follow-up.service.js';
// APT-06: 진료 식별자와 예약 시각을 검증한 후 의사 세션으로 예약한다.
export const create: RequestHandler = async (req, res) => {
  sendData(
    res,
    await createFollowUp(
      res.locals.account as AccountContext,
      parseAppointmentId(req.params.visitId),
      parseAppointmentTime(req.body),
    ),
    201,
  );
};
