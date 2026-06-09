import { Router } from 'express';
import * as ctrl from './agency-invitations.controller';

export const ownerRouter = Router();

ownerRouter.post('/invitations',              ctrl.create);
ownerRouter.get('/invitations',               ctrl.listForOwner);
ownerRouter.post('/invitations/:id/cancel',   ctrl.cancel);

export const adminRouter = Router();

adminRouter.get('/invitations',               ctrl.adminList);
adminRouter.post('/invitations/:id/approve',  ctrl.approve);
adminRouter.post('/invitations/:id/reject',   ctrl.reject);
