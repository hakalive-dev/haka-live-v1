import { Router } from 'express';
import { requirePermission } from '../../../middleware/admin-auth.middleware';
import * as ctrl from './admin-themes.controller';

const router = Router();

router.get('/',      requirePermission('gift.manage'), ctrl.listThemes);
router.post('/',     requirePermission('gift.manage'), ctrl.uploadThemeFiles, ctrl.createTheme);
router.patch('/:id', requirePermission('gift.manage'), ctrl.uploadThemeFiles, ctrl.updateTheme);
router.delete('/:id',requirePermission('gift.manage'), ctrl.deleteTheme);

export default router;
