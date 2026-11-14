import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import { listDoctorPatients } from '../controllers/doctor-patients.controller.js';
export const doctorPatientsRouter = Router();
doctorPatientsRouter.get('/me/patients', requireAccount, requireRole('DOCTOR'), listDoctorPatients);
