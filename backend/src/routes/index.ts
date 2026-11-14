import { Router } from 'express';
import { accountRouter } from '../modules/account/routes/account.routes.js';
import { medicalStaffRouter } from '../modules/medical-staff/routes/medical-staff.routes.js';
import { patientRouter } from '../modules/patient/routes/patient.routes.js';
import { availabilityRouter } from '../modules/doctor-schedule/routes/availability.routes.js';
import { leaveRouter } from '../modules/doctor-schedule/routes/leave.routes.js';

export const apiRouter = Router();
apiRouter.use('/accounts', accountRouter);
apiRouter.use(medicalStaffRouter);
apiRouter.use('/patients', patientRouter);
apiRouter.use(availabilityRouter);
apiRouter.use(leaveRouter);
