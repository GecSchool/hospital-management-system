import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import { parseAccountId } from '../../account/validations/account-query.validation.js';
import { parseClinicalHistoryQuery } from '../../clinical-record/validations/clinical-history.validation.js';
import { parseClinicalVersionNo } from '../../clinical-record/validations/clinical-record-query.validation.js';
import * as service from '../services/nursing-record-query.service.js';
// 접수의 간호 기록을 커서 페이지로 조회한다.
export const list: RequestHandler = async (req, res) => {
  const result = await service.listNursingRecords(
    res.locals.account as AccountContext,
    parseAccountId(req.params.receptionId),
    parseClinicalHistoryQuery(req.query),
  );
  sendData(res, result.data, 200, result.meta);
};
// 선택한 간호 기록과 버전 이력을 조회한다.
export const get: RequestHandler = async (req, res) => {
  sendData(
    res,
    await service.getNursingRecord(
      res.locals.account as AccountContext,
      parseAccountId(req.params.recordId),
    ),
  );
};
// 원본이나 선택한 정정 버전을 조회한다.
export const getVersion: RequestHandler = async (req, res) => {
  sendData(
    res,
    await service.getNursingVersion(
      res.locals.account as AccountContext,
      parseAccountId(req.params.recordId),
      parseClinicalVersionNo(req.params.versionNo),
    ),
  );
};
