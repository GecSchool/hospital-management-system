import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import {
  parseClinicalWriteId,
  parseClinicalComplete,
  parseClinicalCorrection,
} from '../validations/clinical-record-write.validation.js';
import * as service from '../services/clinical-record-write.service.js';
// VIS-04: 세션 의사와 요청을 검증하여 진료 완료와 원본을 200으로 반환한다.
export const complete: RequestHandler = async (req, res) => {
  sendData(
    res,
    await service.completeVisit(
      res.locals.account as AccountContext,
      parseClinicalWriteId(req.params.visitId),
      parseClinicalComplete(req.body),
    ),
  );
};
// VIS-07: 세션 의사와 요청을 검증하여 새 정정 버전을 201로 반환한다.
export const correct: RequestHandler = async (req, res) => {
  sendData(
    res,
    await service.correctClinicalRecord(
      res.locals.account as AccountContext,
      parseClinicalWriteId(req.params.recordId),
      parseClinicalCorrection(req.body),
    ),
    201,
  );
};
