import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import { parsePatientId } from '../validations/patient.validation.js';
import { parsePatientVisitsQuery } from '../validations/patient-visits.validation.js';
import { listPatientVisits } from '../services/patient-visits.service.js';
// PAT-07: 직원의 페이지 요청을 검증하여 진료 본문이 없는 요약을 반환한다.
export const list: RequestHandler = async (req, res) => {
  const p = parsePatientVisitsQuery(req.query);
  const result = await listPatientVisits(
    res.locals.account as AccountContext,
    parsePatientId(req.params.patientId),
    p.page,
    p.size,
  );
  sendData(res, result.data, 200, result.meta);
};
