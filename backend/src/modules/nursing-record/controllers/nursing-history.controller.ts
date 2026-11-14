import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import { parseAccountId } from '../../account/validations/account-query.validation.js';
import { parseNursingHistoryQuery } from '../validations/nursing-history.validation.js';
import { getNursingHistory } from '../services/nursing-history.service.js';
/** 인증된 간호사의 환자·선택 접수·커서를 검증하고 이력과 meta를 반환한다. */
export const get: RequestHandler = async (req, res) => {
  const result = await getNursingHistory(
    parseAccountId(req.params.patientId),
    res.locals.account as AccountContext,
    parseNursingHistoryQuery(req.query),
  );
  sendData(res, result.data, 200, result.meta);
};
