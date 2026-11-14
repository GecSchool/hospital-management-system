import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import { parseAccountId } from '../../account/validations/account-query.validation.js';
import { parseLeaveRange, parseLeaveRequest } from '../validations/leave.validation.js';
import { listLeaves, createLeave } from '../services/leave.service.js';
// 인증된 사용자의 대상 의사와 날짜 범위를 검증해 휴진 목록을 반환한다.
export const list: RequestHandler = async (req, res) => {
  const { from, to } = parseLeaveRange(req.query);
  sendData(
    res,
    await listLeaves(
      res.locals.account as AccountContext,
      parseAccountId(req.params.doctorId),
      from,
      to,
    ),
  );
};
// 인증된 의사의 휴진일을 입력받아 생성된 날짜를 201 응답한다.
export const create: RequestHandler = async (req, res) => {
  sendData(
    res,
    await createLeave(res.locals.account as AccountContext, parseLeaveRequest(req.body)),
    201,
  );
};
