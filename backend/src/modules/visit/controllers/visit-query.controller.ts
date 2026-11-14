import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import { parseVisitId } from '../validations/visit-query.validation.js';
import * as service from '../services/visit-query.service.js';
// 인증된 담당 의사의 진료 상세를 공통 응답으로 전달한다.
export const getVisit: RequestHandler = async (req, res) => {
  sendData(
    res,
    await service.getVisit(res.locals.account as AccountContext, parseVisitId(req.params.visitId)),
  );
};
