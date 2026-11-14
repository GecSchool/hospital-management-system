import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import { parseDoctorPatientsQuery } from '../validations/doctor-patients.validation.js';
import * as service from '../services/doctor-patients.service.js';
// 의사 환자 목록을 공통 응답으로 반환한다.
export const listDoctorPatients: RequestHandler = async (req, res) => {
  sendData(
    res,
    await service.listDoctorPatients(
      res.locals.account as AccountContext,
      parseDoctorPatientsQuery(req.query),
    ),
  );
};
