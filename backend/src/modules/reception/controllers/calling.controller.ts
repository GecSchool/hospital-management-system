import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import { parseCallingReceptionId } from '../validations/calling.validation.js';
import * as service from '../services/calling.service.js';
/** 인증 계정 및 접수 ID로 호출 처리를 요청해 200을 반환한다. */
export const call: RequestHandler = async (req, res) => {
  sendData(
    res,
    await service.callReception(
      parseCallingReceptionId(req.params.receptionId),
      res.locals.account as AccountContext,
    ),
  );
};
/** 인증 계정 및 접수 ID로 입실을 요청해 생성된 진료를 201로 반환한다. */
export const confirm: RequestHandler = async (req, res) => {
  sendData(
    res,
    await service.confirmEntry(
      parseCallingReceptionId(req.params.receptionId),
      res.locals.account as AccountContext,
    ),
    201,
  );
};
