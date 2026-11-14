import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import {
  parseNursingWriteId,
  parseNursingCreate,
  parseNursingCorrection,
} from '../validations/nursing-record-write.validation.js';
import * as service from '../services/nursing-record-write.service.js';
// NUR-02: 세션 간호사와 요청 검증 후 생성된 간호기록을 201로 반환한다.
export const create: RequestHandler = async (req, res) => {
  sendData(
    res,
    await service.createNursingRecord(
      res.locals.account as AccountContext,
      parseNursingWriteId(req.params.receptionId),
      parseNursingCreate(req.body),
    ),
    201,
  );
};
// NUR-05: 세션 간호사와 요청 검증 후 생성된 정정 버전을 201로 반환한다.
export const correct: RequestHandler = async (req, res) => {
  sendData(
    res,
    await service.correctNursingRecord(
      res.locals.account as AccountContext,
      parseNursingWriteId(req.params.recordId),
      parseNursingCorrection(req.body),
    ),
    201,
  );
};
