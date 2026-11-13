import type { RequestHandler } from 'express';
import { AppError } from '../../../common/errors/index.js';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import * as medicalStaffService from '../services/medical-staff.service.js';
import {
  parseDepartmentId,
  parseDoctorsQuery,
  parseMedicalStaffQuery,
} from '../validations/medical-staff.validation.js';
import { parseAccountId } from '../../account/validations/account-query.validation.js';

export const changeDepartment: RequestHandler = async (req, res) => {
  const actor = res.locals.account as AccountContext;
  const body = req.body as unknown;
  const departmentId =
    typeof body === 'object' && body !== null && 'departmentId' in body
      ? parseDepartmentId(body.departmentId)
      : parseDepartmentId(undefined);
  sendData(
    res,
    await medicalStaffService.changeDepartment(
      actor.id,
      parseAccountId(req.params.accountId),
      departmentId,
    ),
  );
};

export const listMedicalStaff: RequestHandler = async (req, res) => {
  const departmentId = parseDepartmentId(req.params.departmentId);
  const result = await medicalStaffService.listMedicalStaff(
    departmentId,
    parseMedicalStaffQuery(req.query),
  );
  sendData(res, result.data, 200, result.meta);
};

export const listDoctors: RequestHandler = async (req, res) => {
  const departmentId = parseDepartmentId(req.params.departmentId);
  const account = res.locals.account as AccountContext;
  if (account.role === 'NURSE' && account.departmentId !== departmentId) {
    throw new AppError(403, 'FORBIDDEN', '소속 진료과의 의사만 조회할 수 있습니다.');
  }
  const { activeOnly } = parseDoctorsQuery(req.query);
  sendData(res, await medicalStaffService.listDoctors(departmentId, activeOnly));
};
