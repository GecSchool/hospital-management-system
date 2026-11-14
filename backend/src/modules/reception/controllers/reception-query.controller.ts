import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import {
  parseReceptionId,
  parseReceptionQuery,
} from '../validations/reception-query.validation.js';
import * as service from '../services/reception-query.service.js';
// 인증된 계정의 조건 및 입력을 검증하고 공통 응답으로 반환한다.
export const listReceptions: RequestHandler = async (req, res) => {
  const result = await service.listReceptions(
    res.locals.account as AccountContext,
    parseReceptionQuery(req.query),
  );
  sendData(res, result.data, 200, result.meta);
};
export const getReception: RequestHandler = async (req, res) => {
  sendData(
    res,
    await service.getReception(
      res.locals.account as AccountContext,
      parseReceptionId(req.params.receptionId),
    ),
  );
};
