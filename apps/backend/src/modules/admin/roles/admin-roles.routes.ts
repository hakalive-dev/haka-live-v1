import { Router } from 'express';
import { requirePermission } from '../../../middleware/admin-auth.middleware';
import * as ctrl from './admin-roles.controller';

const router = Router();

router.get('/',        requirePermission('admin.view'),         ctrl.getAllRoles);
router.get('/custom',  requirePermission('admin.view'),         ctrl.listCustomRoles);
router.post('/',       requirePermission('admin.custom_roles'), ctrl.createCustomRole);
router.patch('/:name', requirePermission('admin.custom_roles'), ctrl.updateCustomRole);
router.delete('/:name',requirePermission('admin.custom_roles'), ctrl.deleteCustomRole);

export default router;
