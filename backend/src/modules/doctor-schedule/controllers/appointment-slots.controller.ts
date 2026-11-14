import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import { parseAccountId } from '../../account/validations/account-query.validation.js';
import { parseSlotQuery } from '../validations/appointment-slots.validation.js';
import { getAppointmentSlots } from '../services/appointment-slots.service.js';
/** 인증된 사용자의 의사·날짜·선택적 제외 예약을 검증해 시간표 조회를 요청한다. */
export const get: RequestHandler = async (req, res) => {
  const { date, excludeAppointmentId } = parseSlotQuery(req.query);
  sendData(
    res,
    await getAppointmentSlots(
      parseAccountId(req.params.doctorId),
      date,
      res.locals.account as AccountContext,
      excludeAppointmentId,
    ),
  );
};
