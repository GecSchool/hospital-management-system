import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import { parseAccountId } from '../../account/validations/account-query.validation.js';
import { parseClinicalVersionNo } from '../validations/clinical-record-query.validation.js';
import * as service from '../services/clinical-record-query.service.js';
/** 인증된 의사의 최신 기록·버전 목록 조회를 처리한다. */
export const get: RequestHandler = async (req, res) => {
  sendData(
    res,
    await service.getClinicalRecord(
      parseAccountId(req.params.recordId),
      res.locals.account as AccountContext,
    ),
  );
};
/** 인증된 의사의 특정 기록 버전 조회를 처리한다. */
export const getVersion: RequestHandler = async (req, res) => {
  sendData(
    res,
    await service.getClinicalVersion(
      parseAccountId(req.params.recordId),
      parseClinicalVersionNo(req.params.versionNo),
      res.locals.account as AccountContext,
    ),
  );
};
