import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { storeController } from './store.controller';

const router = Router();

// General store
router.get('/categories', storeController.getCategories);
router.get('/items',      authenticate, storeController.getItems);
router.post('/purchase',  authenticate, storeController.purchase);
router.post('/send',      authenticate, storeController.sendItem);
router.get('/mine',       authenticate, storeController.getMyItems);
router.post('/equip',     authenticate, storeController.equip);
router.post('/unequip',   authenticate, storeController.unequip);

// Special ID store
router.get('/special-ids',              authenticate, storeController.getSpecialIds);
router.post('/special-ids/purchase',    authenticate, storeController.purchaseSpecialId);
router.post('/special-ids/send',        authenticate, storeController.sendSpecialId);
router.get('/special-ids/mine',         authenticate, storeController.getMySpecialIds);
router.post('/special-ids/activate',    authenticate, storeController.activateSpecialId);
router.post('/special-ids/deactivate',  authenticate, storeController.deactivateSpecialId);

export default router;
