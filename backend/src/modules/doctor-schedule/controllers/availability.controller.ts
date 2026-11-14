import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import { parseAccountId } from '../../account/validations/account-query.validation.js';
import { parseWeeklySlots } from '../validations/availability.validation.js';
import * as service from '../services/availability.service.js';
/** SCH-01: 의사 ID와 인증된 사용자로 권한 검사 후 시간표를 반환한다. */
export const get: RequestHandler = async (req, res) => {
  sendData(
    res,
    await service.getAvailability(
      parseAccountId(req.params.doctorId),
      res.locals.account as AccountContext,
    ),
  );
};
/** SCH-02: 본문을 검증하여 인증된 의사 본인의 시간표를 교체한다. */
export const replace: RequestHandler = async (req, res) => {
  const actor = res.locals.account as AccountContext;
  sendData(res, await service.replaceAvailability(actor.id, parseWeeklySlots(req.body)));
};
