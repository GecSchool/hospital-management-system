import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import { parseReceptionCreate, parseReceptionId } from '../validations/reception.validation.js';
import * as service from '../services/reception.service.js';
// REC-01: 요청 검증과 세션 계정 확인 후 201 접수 응답을 반환한다.
export const create: RequestHandler = async (req, res) => {
  sendData(
    res,
    await service.createReception(
      res.locals.account as AccountContext,
      parseReceptionCreate(req.body),
    ),
    201,
  );
};
// REC-04: 접수 ID 검증 후 물리 삭제하고 본문 없는 204를 반환한다.
export const remove: RequestHandler = async (req, res) => {
  await service.deleteReception(
    res.locals.account as AccountContext,
    parseReceptionId(req.params.receptionId),
  );
  res.status(204).end();
};
