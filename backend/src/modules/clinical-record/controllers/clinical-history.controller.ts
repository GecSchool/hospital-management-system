import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import { parseAccountId } from '../../account/validations/account-query.validation.js';
import { parseClinicalHistoryQuery } from '../validations/clinical-history.validation.js';
import { getClinicalHistory } from '../services/clinical-history.service.js';
/** 의사의 환자 ID·조회 조건을 검증하고 이력과 커서 meta를 반환한다. */
export const get: RequestHandler = async (req, res) => {
  const result = await getClinicalHistory(
    parseAccountId(req.params.patientId),
    res.locals.account as AccountContext,
    parseClinicalHistoryQuery(req.query),
  );
  sendData(res, result.data, 200, result.meta);
};
