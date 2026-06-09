import { Router } from 'express';
import * as ctrl from './admin-auth.controller';
import { authenticateAdmin, requireAdminRole } from '../../../middleware/admin-auth.middleware';
import { adminUpload } from '../../../utils/upload';

const router = Router();

// Public
router.post('/login',   ctrl.login);
router.post('/login-otp', ctrl.loginWithOtp);
router.post('/refresh',  ctrl.refresh);

// Authenticated
router.get('/me',              authenticateAdmin, ctrl.getMe);
router.post('/logout',         authenticateAdmin, ctrl.logout);
router.post('/change-password', authenticateAdmin, ctrl.changePassword);

// File upload (evidence, etc.)
router.post('/upload',               authenticateAdmin, adminUpload.single('file'), ctrl.uploadFile);
// Avatar upload (any authenticated admin for their own avatar)
router.post('/me/avatar',            authenticateAdmin, adminUpload.single('file'), ctrl.updateMyAvatar);

// Super admin only
router.post('/admins',                authenticateAdmin, requireAdminRole('super_admin'), ctrl.createAdmin);
router.get('/admins',                 authenticateAdmin, requireAdminRole('super_admin'), ctrl.listAdmins);
router.patch('/admins/:id',           authenticateAdmin, requireAdminRole('super_admin'), ctrl.updateAdmin);
router.delete('/admins/:id',          authenticateAdmin, requireAdminRole('super_admin'), ctrl.deactivateAdmin);
router.patch('/admins/:id/activate',  authenticateAdmin, requireAdminRole('super_admin'), ctrl.reactivateAdmin);
router.post('/admins/:id/remove-permissions',  authenticateAdmin, requireAdminRole('super_admin'), ctrl.removePermissions);
router.post('/admins/:id/restore-permissions', authenticateAdmin, requireAdminRole('super_admin'), ctrl.restorePermissions);
router.post('/admins/:id/reset-password', authenticateAdmin, requireAdminRole('super_admin'), ctrl.resetPassword);
router.post('/admins/:id/generate-otp', authenticateAdmin, requireAdminRole('super_admin'), ctrl.generateOtp);
router.get('/admins/:id/can-delete', authenticateAdmin, requireAdminRole('super_admin'), ctrl.canDeleteAdmin);
router.delete('/admins/:id/hard-delete', authenticateAdmin, requireAdminRole('super_admin'), ctrl.hardDeleteAdmin);

export default router;
