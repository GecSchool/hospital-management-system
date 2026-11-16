// DEP-01~05 진료과 관리. /api/v1/departments 아래에 연결한다.
import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import * as departmentController from '../controllers/department.controller.js';

export const departmentRouter = Router();
const adminOnly = [requireAccount, requireRole('ADMIN')];

// 목록은 예약·소속 선택 화면에서도 쓰므로 로그인한 모든 역할이 조회할 수 있다.
departmentRouter.get('/', requireAccount, departmentController.list);
departmentRouter.post('/', adminOnly, departmentController.create);
departmentRouter.patch('/:departmentId', adminOnly, departmentController.rename);
departmentRouter.patch('/:departmentId/status', adminOnly, departmentController.changeStatus);
departmentRouter.delete('/:departmentId', adminOnly, departmentController.remove);
