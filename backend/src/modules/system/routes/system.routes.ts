import { Router } from 'express';
import { health } from '../controllers/system.controller.js';

export const systemRouter = Router();
systemRouter.get('/health', health);
