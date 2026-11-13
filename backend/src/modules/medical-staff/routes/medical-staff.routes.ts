import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import * as medicalStaffController from '../controllers/medical-staff.controller.js';

export const medicalStaffRouter = Router();

medicalStaffRouter.get(
  '/departments/:departmentId/medical-staff',
  requireAccount,
  requireRole('ADMIN'),
  medicalStaffController.listMedicalStaff,
);
medicalStaffRouter.get(
  '/departments/:departmentId/doctors',
  requireAccount,
  requireRole('STAFF', 'NURSE', 'ADMIN'),
  medicalStaffController.listDoctors,
);
