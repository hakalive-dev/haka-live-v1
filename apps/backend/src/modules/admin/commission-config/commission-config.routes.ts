import { Router } from 'express';
import { requirePermission } from '../../../middleware/admin-auth.middleware';
import * as ctrl from './commission-config.controller';

const router = Router();

// Tiers
router.get('/commission-tiers',         requirePermission('gift.manage'), ctrl.listTiers);
router.post('/commission-tiers',        requirePermission('gift.manage'), ctrl.createTier);
router.patch('/commission-tiers/:id',   requirePermission('gift.manage'), ctrl.updateTier);
router.delete('/commission-tiers/:id',  requirePermission('gift.manage'), ctrl.deleteTier);

// Gift-bonus singleton (id = "singleton")
router.get('/gift-bonus-setting',       requirePermission('gift.manage'), ctrl.getBonusSetting);
router.patch('/gift-bonus-setting',     requirePermission('gift.manage'), ctrl.updateBonusSetting);

// Rolling gift-bonus tiers (7-day agency host-income thresholds)
router.get('/gift-bonus-tiers',         requirePermission('gift.manage'), ctrl.listGiftBonusTiers);
router.post('/gift-bonus-tiers',        requirePermission('gift.manage'), ctrl.createGiftBonusTier);
router.patch('/gift-bonus-tiers/:id',   requirePermission('gift.manage'), ctrl.updateGiftBonusTier);
router.delete('/gift-bonus-tiers/:id',  requirePermission('gift.manage'), ctrl.deleteGiftBonusTier);

// Per-agency overrides (Task 6)
router.patch('/agencies/:id/commission-override', requirePermission('gift.manage'), ctrl.setCommissionOverride);
router.patch('/agencies/:id/gift-bonus-override',  requirePermission('gift.manage'), ctrl.setGiftBonusOverride);

// Commission ledger (Task 7)
router.get('/agencies/:id/commission-ledger', requirePermission('gift.manage'), ctrl.adminListLedger);

// Platform (company) bean revenue
router.get('/platform-revenue',        requirePermission('gift.manage'), ctrl.getPlatformRevenue);
router.get('/platform-revenue/ledger', requirePermission('gift.manage'), ctrl.listPlatformRevenueLedger);

export default router;
