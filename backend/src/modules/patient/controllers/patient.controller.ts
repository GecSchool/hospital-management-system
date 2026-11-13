import type { RequestHandler } from 'express';
import { AppError } from '../../../common/errors/index.js';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import {
  parsePatientCreate,
  parsePatientQuery,
  parsePatientId,
  parsePatientUpdate,
} from '../validations/patient.validation.js';
import * as patientService from '../services/patient.service.js';

export const list: RequestHandler = async (req, res) => {
  const actor = res.locals.account as AccountContext;
  if (actor.role === 'NURSE' && req.query.patientNumber !== undefined)
    throw new AppError(403, 'FORBIDDEN', '환자번호로 검색할 수 없습니다.');
  const result = await patientService.listPatients(
    parsePatientQuery(req.query),
    actor.role === 'STAFF',
  );
  sendData(res, result.data, 200, result.meta);
};
export const create: RequestHandler = async (req, res) => {
  const result = await patientService.createPatient(parsePatientCreate(req.body));
  sendData(res, result, 201);
};
export const get: RequestHandler = async (req, res) => {
  const actor = res.locals.account as AccountContext;
  const id = parsePatientId(req.params.patientId);
  sendData(
    res,
    actor.role === 'STAFF'
      ? await patientService.getPatient(id)
      : await patientService.getMedicalPatient(id, actor),
  );
};
export const update: RequestHandler = async (req, res) => {
  sendData(
    res,
    await patientService.updatePatient(
      parsePatientId(req.params.patientId),
      parsePatientUpdate(req.body),
    ),
  );
};
