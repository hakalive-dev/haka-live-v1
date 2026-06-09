import { Router } from 'express';
import * as ctrl from './admin-tags.controller';
import { requirePermission } from '../../../middleware/admin-auth.middleware';

const router = Router();

// Catalogue
router.get('/',        requirePermission('admin.view'),  ctrl.list);
router.post('/',       requirePermission('tags.manage'), ctrl.create);
router.patch('/:id',   requirePermission('tags.manage'), ctrl.update);
router.delete('/:id',  requirePermission('tags.manage'), ctrl.remove);

// Assignment to users
router.post('/users/bulk',                requirePermission('user.tag_assign'), ctrl.bulkAssign);
router.get('/users/:userId',              requirePermission('user.view'),       ctrl.listForUser);
router.post('/users/:userId',             requirePermission('user.tag_assign'), ctrl.assign);
router.delete('/users/:userId/:tagId',    requirePermission('user.tag_assign'), ctrl.revoke);

export default router;
