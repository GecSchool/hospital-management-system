// DEP-01~05 진료과 관리. 입력을 검사해 서비스에 넘기고 공통 형식으로 응답한다.
import type { RequestHandler } from 'express';
import { invalidateDoctorLists } from '../../medical-staff/services/doctor-list-cache.js';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import * as departmentService from '../services/department.service.js';
import {
  parseDepartmentId,
  parseDepartmentListQuery,
  parseDepartmentName,
  parseDepartmentStatus,
} from '../validations/department.validation.js';

export const list: RequestHandler = async (req, res) => {
  const actor = res.locals.account as AccountContext;
  sendData(res, await departmentService.list(actor, parseDepartmentListQuery(req.query)));
};

export const create: RequestHandler = async (req, res) => {
  sendData(res, await departmentService.create(parseDepartmentName(req.body)), 201);
};

export const rename: RequestHandler = async (req, res) => {
  const id = parseDepartmentId(req.params.departmentId);
  const value = await departmentService.rename(id, parseDepartmentName(req.body));
  await invalidateDoctorLists(req.app.locals.auth?.doctorListCache);
  sendData(res, value);
};

export const changeStatus: RequestHandler = async (req, res) => {
  const id = parseDepartmentId(req.params.departmentId);
  const value = await departmentService.changeStatus(id, parseDepartmentStatus(req.body));
  await invalidateDoctorLists(req.app.locals.auth?.doctorListCache);
  sendData(res, value);
};

export const remove: RequestHandler = async (req, res) => {
  await departmentService.remove(parseDepartmentId(req.params.departmentId));
  res.status(204).end();
};
